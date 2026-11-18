import { randomUUID } from "node:crypto";
import makeWASocket, {
  Browsers, DisconnectReason, makeCacheableSignalKeyStore, jidDecode, jidNormalizedUser, areJidsSameUser,
  isJidGroup, ALL_WA_PATCH_NAMES, type WASocket,
} from "baileys";
import pino from "pino";
import { and, eq, sql, inArray } from "drizzle-orm";
import { getContext } from "@netlify/server";
import { db, waConnections, contacts, campaignRecipients, userSettings } from "../../db/index.js";
import { useDbAuthState, clearAuthState } from "./authState.js";
import { normalizeContact, persistContacts, persistGroups, applyLidMapping, type NormContact, type NormGroup } from "./store.js";
import { rows, logActivity } from "../lib/store.js";

export const INSTANCE_ID = randomUUID();
const logger = pino({ level: process.env.WA_LOG_LEVEL ?? "error" });
const LEASE_MS = 60_000;

export class WaError extends Error {
  constructor(public code: "NOT_CONNECTED" | "BUSY" | "TIMEOUT" | "LOGGED_OUT" | "FAILED", message: string) {
    super(message);
  }
}

type Purpose = "pair" | "use";
type Handle = {
  userId: number;
  sock: WASocket | null;
  purpose: Purpose;
  method?: "qr" | "code";
  pairingPhone?: string;
  pairingRequested: boolean;
  open: boolean;
  /** já abriu ao menos uma vez nesta vida do handle */
  paired: boolean;
  closing: boolean;
  keepUntil: number;
  busy: number;
  reconnects: number;
  waitOpen: Promise<void>;
  resolveOpen: () => void;
  rejectOpen: (e: Error) => void;
  firstCode: Promise<void>;
  resolveFirstCode: () => void;
  closed: Promise<void>;
  resolveClosed: () => void;
  timer?: ReturnType<typeof setInterval>;
  contactBuffer: NormContact[];
  flushTimer?: ReturnType<typeof setTimeout>;
  credsChain: Promise<void>;
  syncStarted: boolean;
};

const handles = new Map<number, Handle>();

function deferred() {
  let resolve!: () => void, reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  promise.catch(() => {});
  return { promise, resolve, reject };
}

/** Mantém o processo vivo enquanto a conexão estiver em uso (scale-to-zero respeitado ao fechar). */
function registerKeepAlive(h: Handle) {
  try {
    getContext().waitUntil(h.closed);
  } catch {
    /* fora de uma requisição */
  }
}

async function setConn(userId: number, values: Partial<typeof waConnections.$inferInsert>) {
  await db
    .insert(waConnections)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: waConnections.userId, set: { ...values, updatedAt: new Date() } });
}

async function acquireLease(userId: number): Promise<boolean> {
  const until = new Date(Date.now() + LEASE_MS);
  const res = await db.execute(sql`
    insert into wa_connections (user_id, lease_owner, lease_until) values (${userId}, ${INSTANCE_ID}, ${until})
    on conflict (user_id) do update set lease_owner = excluded.lease_owner, lease_until = excluded.lease_until
    where wa_connections.lease_until is null or wa_connections.lease_until < now() or wa_connections.lease_owner = excluded.lease_owner
    returning user_id`);
  return rows(res).length > 0;
}

async function releaseLease(userId: number) {
  await db.update(waConnections).set({ leaseOwner: null, leaseUntil: null })
    .where(and(eq(waConnections.userId, userId), eq(waConnections.leaseOwner, INSTANCE_ID))).catch(() => {});
}

function newHandle(userId: number, purpose: Purpose, keepMs: number): Handle {
  const o = deferred(), f = deferred(), c = deferred();
  const h: Handle = {
    userId, sock: null, purpose, pairingRequested: false, open: false, paired: false, closing: false,
    keepUntil: Date.now() + keepMs, busy: 0, reconnects: 0,
    waitOpen: o.promise, resolveOpen: o.resolve, rejectOpen: o.reject,
    firstCode: f.promise, resolveFirstCode: f.resolve,
    closed: c.promise, resolveClosed: c.resolve,
    contactBuffer: [], credsChain: Promise.resolve(), syncStarted: false,
  };
  h.timer = setInterval(() => {
    if (h.closing) return;
    if (Date.now() > h.keepUntil && h.busy === 0) void closeHandle(h, "idle");
    else void acquireLease(userId).catch(() => {});
  }, 5_000);
  handles.set(userId, h);
  return h;
}

async function closeHandle(h: Handle, reason: string) {
  if (h.closing) return;
  h.closing = true;
  if (h.timer) clearInterval(h.timer);
  try { await flushContacts(h); } catch (e) { console.error("[wa] flush contacts", e); }
  try { h.sock?.end(undefined); } catch { /* noop */ }
  await h.credsChain.catch(() => {});
  if (handles.get(h.userId) === h) handles.delete(h.userId);
  await releaseLease(h.userId);
  if (!h.paired && h.purpose === "pair" && reason === "idle") {
    await setConn(h.userId, { status: "disconnected", qr: null, pairingCode: null, lastError: "Tempo para conexão esgotado. Gere um novo código." }).catch(() => {});
  }
  if (!h.paired) h.rejectOpen(new WaError("TIMEOUT", "Conexão não concluída"));
  h.resolveFirstCode();
  h.resolveClosed();
}

function scheduleFlush(h: Handle) {
  if (h.flushTimer) return;
  h.flushTimer = setTimeout(() => {
    h.flushTimer = undefined;
    void flushContacts(h).catch((e) => console.error("[wa] flush", e));
  }, 1500);
}

async function flushContacts(h: Handle) {
  if (h.flushTimer) { clearTimeout(h.flushTimer); h.flushTimer = undefined; }
  const batch = h.contactBuffer.splice(0);
  if (batch.length) await persistContacts(h.userId, batch);
}

function queueContacts(h: Handle, list: any[]) {
  for (const c of list) {
    const n = normalizeContact(c);
    if (n) h.contactBuffer.push(n);
  }
  if (h.contactBuffer.length) scheduleFlush(h);
}

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

async function handleIncoming(h: Handle, msgs: any[]) {
  const candidates = msgs.filter((m) => !m.key?.fromMe && m.key?.remoteJid && !isJidGroup(m.key.remoteJid));
  if (!candidates.length) return;
  const [s] = await db.select({ kw: userSettings.optOutKeywords }).from(userSettings).where(eq(userSettings.userId, h.userId));
  const keywords = (s?.kw ?? "SAIR,PARAR,STOP").split(",").map((k) => stripAccents(k.trim().toUpperCase())).filter(Boolean);
  for (const m of candidates) {
    const text: string = m.message?.conversation ?? m.message?.extendedTextMessage?.text ?? "";
    const norm = stripAccents(text.trim().toUpperCase()).replace(/[.!\s]+$/g, "");
    if (!norm || !keywords.includes(norm)) continue;
    const jids = [m.key.remoteJid, m.key.remoteJidAlt].filter(Boolean).map((j: string) => jidNormalizedUser(j));
    const pnJid = jids.find((j: string) => j.endsWith("@s.whatsapp.net"));
    const target = pnJid ?? jids[0];
    const phone = pnJid ? jidDecode(pnJid)?.user ?? null : null;
    await db.insert(contacts)
      .values({ userId: h.userId, jid: target, phone, notify: m.pushName ?? null, optedOut: true, optedOutAt: new Date() })
      .onConflictDoUpdate({ target: [contacts.userId, contacts.jid], set: { optedOut: true, optedOutAt: new Date(), updatedAt: new Date() } });
    if (jids.length > 1) {
      await db.update(contacts).set({ optedOut: true, optedOutAt: new Date() }).where(and(eq(contacts.userId, h.userId), inArray(contacts.jid, jids)));
    }
    await logActivity({ userId: h.userId, action: "contact.opt_out", details: { phone: phone ?? target, keyword: norm } });
    try {
      await h.sock?.sendMessage(m.key.remoteJid, { text: "Pronto! Você não receberá mais nossas mensagens automáticas." });
    } catch { /* confirmação é opcional */ }
  }
}

async function handleReceipts(h: Handle, updates: any[]) {
  for (const u of updates) {
    const status = u.update?.status;
    const id = u.key?.id;
    if (!id || typeof status !== "number" || status < 3) continue;
    const next = status >= 4 ? "read" : "delivered";
    await db.update(campaignRecipients)
      .set({ status: next, deliveredAt: sql`coalesce(${campaignRecipients.deliveredAt}, now())`, updatedAt: new Date() })
      .where(and(
        eq(campaignRecipients.userId, h.userId),
        eq(campaignRecipients.waMessageId, id),
        next === "read" ? inArray(campaignRecipients.status, ["sent", "delivered"]) : eq(campaignRecipients.status, "sent"),
      ));
  }
}

async function startSocket(h: Handle) {
  const { state, saveCreds } = await useDbAuthState(h.userId);
  const sock = makeWASocket({
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger as any) },
    logger: logger as any,
    browser: Browsers.ubuntu("Chrome"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 30_000,
    getMessage: async () => undefined,
  });
  h.sock = sock;

  sock.ev.on("creds.update", () => {
    h.credsChain = h.credsChain.then(saveCreds).catch((e) => console.error("[wa] saveCreds", e));
  });

  sock.ev.on("connection.update", async (u) => {
    if (h.sock !== sock) return;
    try {
      if (u.qr && h.purpose === "pair") {
        if (h.method === "code") {
          if (!h.pairingRequested && h.pairingPhone) {
            h.pairingRequested = true;
            try {
              const code = await sock.requestPairingCode(h.pairingPhone);
              await setConn(h.userId, { status: "pairing", pairingCode: code, qr: null, pairingExpiresAt: new Date(Date.now() + 160_000), lastError: null });
            } catch (e: any) {
              await setConn(h.userId, { status: "disconnected", lastError: `Falha ao gerar código: ${e?.message ?? e}` });
              void closeHandle(h, "error");
            }
            h.resolveFirstCode();
          }
        } else {
          await setConn(h.userId, { status: "qr", qr: u.qr, pairingCode: null, pairingExpiresAt: new Date(Date.now() + 60_000), lastError: null });
          h.resolveFirstCode();
        }
      }
      if (u.connection === "open") {
        h.open = true;
        h.paired = true;
        h.reconnects = 0;
        await h.credsChain;
        const me = sock.user;
        const phone = me?.id ? jidDecode(me.id)?.user ?? null : null;
        await setConn(h.userId, {
          status: "connected", phone, pushName: me?.name ?? me?.notify ?? null, qr: null, pairingCode: null,
          lastError: null, lastConnectedAt: new Date(), registered: true,
        });
        if (h.purpose === "pair") {
          await logActivity({ userId: h.userId, actorId: h.userId, action: "whatsapp.connected", details: { method: h.method, phone } });
          h.keepUntil = Math.max(h.keepUntil, Date.now() + 75_000);
          if (!h.syncStarted) {
            h.syncStarted = true;
            void runSync(h).catch((e) => console.error("[wa] initial sync", e));
          }
        }
        h.resolveOpen();
      }
      if (u.connection === "close") {
        h.open = false;
        const code = (u.lastDisconnect?.error as any)?.output?.statusCode as number | undefined;
        if (h.closing) return;
        if (h.purpose === "pair" && !h.paired && code !== DisconnectReason.restartRequired) {
          await setConn(h.userId, { status: "disconnected", qr: null, pairingCode: null, lastError: "O código expirou ou o pareamento foi recusado. Tente novamente." });
          void closeHandle(h, "pair_timeout");
          return;
        }
        if (code === DisconnectReason.loggedOut) {
          await clearAuthState(h.userId);
          await setConn(h.userId, { status: "logged_out", lastError: "A sessão foi encerrada no celular. Conecte novamente." });
          await logActivity({ userId: h.userId, action: "whatsapp.logged_out", details: { code } });
          h.rejectOpen(new WaError("LOGGED_OUT", "Sessão do WhatsApp encerrada. Conecte novamente."));
          void closeHandle(h, "logged_out");
          return;
        }
        if (code === DisconnectReason.restartRequired) {
          // Fluxo normal após o pareamento: reabre o socket já com as novas credenciais.
          await h.credsChain;
          void startSocket(h).catch((e) => { h.rejectOpen(e); void closeHandle(h, "error"); });
          return;
        }
        if (code === DisconnectReason.connectionReplaced) {
          await setConn(h.userId, { lastError: "Conexão substituída por outra sessão do WhatsApp Web." });
          h.rejectOpen(new WaError("FAILED", "Conexão substituída por outra sessão"));
          void closeHandle(h, "replaced");
          return;
        }
        if (h.reconnects < 4 && (h.busy > 0 || Date.now() < h.keepUntil)) {
          h.reconnects++;
          const wait = 1000 * 2 ** h.reconnects;
          setTimeout(() => { if (!h.closing) void startSocket(h).catch((e) => { h.rejectOpen(e); void closeHandle(h, "error"); }); }, wait);
          return;
        }
        await setConn(h.userId, { lastError: `Conexão encerrada (código ${code ?? "?"}).` });
        h.rejectOpen(new WaError("FAILED", "Não foi possível manter a conexão com o WhatsApp"));
        void closeHandle(h, "error");
      }
    } catch (e) {
      console.error("[wa] connection.update", e);
    }
  });

  sock.ev.on("messaging-history.set", ({ contacts: cs, chats }) => {
    queueContacts(h, cs ?? []);
    queueContacts(h, (chats ?? []).map((ch: any) => ({ id: ch.id, name: ch.name ?? ch.displayName, pnJid: ch.pnJid, lidJid: ch.lidJid })));
  });
  sock.ev.on("contacts.upsert", (cs) => queueContacts(h, cs));
  sock.ev.on("contacts.update", (cs) => queueContacts(h, cs.filter((c) => c.name || c.notify || c.phoneNumber)));
  sock.ev.on("lid-mapping.update", (m: any) => {
    if (m?.lid && m?.pn) void applyLidMapping(h.userId, m.lid, m.pn).catch(() => {});
  });
  sock.ev.on("messages.update", (ups) => void handleReceipts(h, ups).catch((e) => console.error("[wa] receipts", e)));
  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type === "notify") void handleIncoming(h, messages).catch((e) => console.error("[wa] incoming", e));
  });
}

/** Inicia um novo pareamento (QR Code ou código). Descarta qualquer sessão anterior do usuário. */
export async function startPairing(userId: number, method: "qr" | "code", phone?: string) {
  const prev = handles.get(userId);
  if (prev) await closeHandle(prev, "restart");
  const leased = await acquireLease(userId);
  if (!leased) throw new WaError("BUSY", "Outra instância está usando esta conexão. Aguarde alguns segundos e tente novamente.");
  await clearAuthState(userId);
  await setConn(userId, { status: "connecting", method, pairingPhone: phone ?? null, qr: null, pairingCode: null, lastError: null, phone: null, pushName: null });
  const h = newHandle(userId, "pair", 180_000);
  h.method = method;
  h.pairingPhone = phone;
  registerKeepAlive(h);
  await startSocket(h);
  await Promise.race([h.firstCode, new Promise((r) => setTimeout(r, 18_000))]);
  const [row] = await db.select().from(waConnections).where(eq(waConnections.userId, userId));
  return row;
}

export async function cancelPairing(userId: number) {
  const h = handles.get(userId);
  if (h && !h.open) await closeHandle(h, "cancel");
  await setConn(userId, { status: "disconnected", qr: null, pairingCode: null, lastError: null });
}

/** Garante uma conexão aberta usando a sessão salva. */
export async function ensureConnected(userId: number, keepMs = 60_000): Promise<WASocket> {
  let h = handles.get(userId);
  if (h && !h.closing) {
    h.keepUntil = Math.max(h.keepUntil, Date.now() + keepMs);
    registerKeepAlive(h);
    if (h.open && h.sock) return h.sock;
    if (h.purpose === "pair" && !h.paired) throw new WaError("NOT_CONNECTED", "Pareamento em andamento");
    await withTimeout(h.waitOpen, 35_000);
    return h.sock!;
  }
  const [row] = await db.select({ credsEnc: waConnections.credsEnc, registered: waConnections.registered }).from(waConnections).where(eq(waConnections.userId, userId));
  if (!row?.credsEnc || !row.registered) throw new WaError("NOT_CONNECTED", "WhatsApp não conectado. Conecte seu número primeiro.");
  if (!(await acquireLease(userId))) throw new WaError("BUSY", "A conexão está em uso em outra instância. Tentando novamente em instantes.");
  h = newHandle(userId, "use", keepMs);
  registerKeepAlive(h);
  try {
    await startSocket(h);
    await withTimeout(h.waitOpen, 35_000);
  } catch (e) {
    await closeHandle(h, "error");
    throw e;
  }
  return h.sock!;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new WaError("TIMEOUT", "Tempo esgotado ao conectar no WhatsApp")), ms))]);
}

/** Marca a conexão como em uso por uma tarefa (impede o fechamento por ociosidade). */
export function hold(userId: number) {
  const h = handles.get(userId);
  if (h) h.busy++;
  return () => {
    if (h) { h.busy = Math.max(0, h.busy - 1); h.keepUntil = Math.max(h.keepUntil, Date.now() + 30_000); }
  };
}

export function isLive(userId: number) {
  const h = handles.get(userId);
  return !!h && h.open && !h.closing;
}

export async function disconnect(userId: number, opts: { logout: boolean }) {
  const h = handles.get(userId);
  if (opts.logout) {
    try {
      const sock = h?.open ? h.sock : await ensureConnected(userId, 10_000).catch(() => null);
      await sock?.logout();
    } catch { /* sessão já inválida */ }
  }
  const cur = handles.get(userId);
  if (cur) await closeHandle(cur, "manual");
  await clearAuthState(userId);
  await setConn(userId, { status: "disconnected", phone: null, pushName: null, profilePicUrl: null, lastError: null, syncing: false });
}

/** Sincroniza grupos, contatos (app state) e fotos de perfil. */
async function runSync(h: Handle) {
  const userId = h.userId;
  const release = hold(userId);
  await setConn(userId, { syncing: true });
  try {
    const sock = h.sock!;
    const me = sock.user;
    // Grupos
    try {
      const all = await sock.groupFetchAllParticipating();
      const list: NormGroup[] = Object.values(all).map((g: any) => {
        const mine = (g.participants ?? []).find((p: any) =>
          (me?.id && areJidsSameUser(p.id, me.id)) || (me?.lid && areJidsSameUser(p.id, me.lid)) ||
          (me?.id && p.phoneNumber && areJidsSameUser(p.phoneNumber, me.id)));
        return {
          jid: g.id, subject: g.subject ?? "", size: g.size ?? g.participants?.length ?? null,
          announce: !!g.announce, isAdmin: !!mine?.admin,
        };
      });
      await persistGroups(userId, list, { replace: true });
    } catch (e) {
      console.error("[wa] groups", e);
    }
    // Contatos salvos na agenda chegam pelo app state (contactAction).
    try {
      await sock.resyncAppState(ALL_WA_PATCH_NAMES, false);
    } catch (e) {
      console.error("[wa] app state resync", e);
    }
    await new Promise((r) => setTimeout(r, 4000));
    await flushContacts(h);
    // Fotos de perfil (melhor esforço, limitado para não gerar abuso de requisições).
    const deadline = Date.now() + 25_000;
    const groupsNoPic = await db.execute(sql`select jid from wa_groups where user_id = ${userId} and img_url is null limit 80`);
    const contactsNoPic = await db.execute(sql`select jid from contacts where user_id = ${userId} and img_url is null and phone is not null order by name nulls last limit 120`);
    for (const r of [...rows<{ jid: string }>(groupsNoPic).map((x) => ({ ...x, g: true })), ...rows<{ jid: string }>(contactsNoPic).map((x) => ({ ...x, g: false }))]) {
      if (Date.now() > deadline || h.closing) break;
      let url: string | null = null;
      try { url = (await sock.profilePictureUrl(r.jid, "preview", 5000)) ?? null; } catch { url = null; }
      const value = url ?? "none";
      if (r.g) await db.execute(sql`update wa_groups set img_url = ${value} where user_id = ${userId} and jid = ${r.jid}`);
      else await db.execute(sql`update contacts set img_url = ${value} where user_id = ${userId} and jid = ${r.jid}`);
      await new Promise((res) => setTimeout(res, 250));
    }
    if (me?.id) {
      try {
        const own = await sock.profilePictureUrl(jidNormalizedUser(me.id), "preview", 5000);
        if (own) await setConn(userId, { profilePicUrl: own });
      } catch { /* sem foto */ }
    }
  } finally {
    await setConn(userId, { syncing: false, lastSyncAt: new Date() }).catch(() => {});
    release();
  }
}

/** Sincronização manual (botão "Sincronizar"). Responde rápido; o restante roda em background. */
export async function requestSync(userId: number) {
  await ensureConnected(userId, 90_000);
  const h = handles.get(userId)!;
  const p = runSync(h).catch((e) => console.error("[wa] sync", e));
  try { getContext().waitUntil(p); } catch { /* noop */ }
}
