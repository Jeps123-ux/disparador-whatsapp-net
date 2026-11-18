import { Hono } from "hono";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, contacts, waGroups, userSettings } from "../../db/index.js";
import type { AppEnv } from "../lib/auth.js";
import { getSettings, logActivity } from "../lib/store.js";

export const contactRoutes = new Hono<AppEnv>();

const imgOrNull = (v: string | null) => (v && v !== "none" ? v : null);

contactRoutes.get("/", async (c) => {
  const scope = c.get("scopeUserId");
  const list = await db
    .select({
      id: contacts.id, jid: contacts.jid, phone: contacts.phone, name: contacts.name, notify: contacts.notify,
      imgUrl: contacts.imgUrl, optedOut: contacts.optedOut, source: contacts.source,
    })
    .from(contacts)
    .where(eq(contacts.userId, scope))
    .orderBy(sql`coalesce(${contacts.name}, ${contacts.notify}, ${contacts.phone}) asc nulls last`);
  return c.json({ contacts: list.map((x) => ({ ...x, imgUrl: imgOrNull(x.imgUrl) })) });
});

/** Cadastro manual (para quem já autorizou o recebimento mas não está na agenda sincronizada). */
contactRoutes.post("/", async (c) => {
  const scope = c.get("scopeUserId");
  const body = await c.req.json().catch(() => ({}));
  const phone = String(body.phone ?? "").replace(/\D/g, "");
  const name = String(body.name ?? "").trim().slice(0, 200) || null;
  if (phone.length < 10 || phone.length > 15) return c.json({ error: "Telefone inválido. Use DDI + DDD + número (ex.: 5511987654321)" }, 400);
  if (body.consent !== true) return c.json({ error: "Confirme que o contato autorizou o recebimento de mensagens" }, 400);
  const jid = `${phone}@s.whatsapp.net`;
  const [row] = await db.insert(contacts)
    .values({ userId: scope, jid, phone, name, source: "manual" })
    .onConflictDoUpdate({ target: [contacts.userId, contacts.jid], set: { name: sql`coalesce(excluded.name, ${contacts.name})`, updatedAt: new Date() } })
    .returning();
  await logActivity({ userId: scope, actorId: c.get("user").id, action: "contact.created", details: { phone } });
  return c.json({ contact: row });
});

contactRoutes.patch("/:id", async (c) => {
  const scope = c.get("scopeUserId");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.optedOut === "boolean") { set.optedOut = body.optedOut; set.optedOutAt = body.optedOut ? new Date() : null; }
  if (typeof body.name === "string") set.name = body.name.trim().slice(0, 200) || null;
  const [row] = await db.update(contacts).set(set).where(and(eq(contacts.id, id), eq(contacts.userId, scope))).returning();
  if (!row) return c.json({ error: "Contato não encontrado" }, 404);
  if (typeof body.optedOut === "boolean") {
    await logActivity({ userId: scope, actorId: c.get("user").id, action: body.optedOut ? "contact.opt_out" : "contact.opt_in", details: { contactId: id, manual: true } });
  }
  return c.json({ contact: row });
});

contactRoutes.delete("/:id", async (c) => {
  const scope = c.get("scopeUserId");
  const id = Number(c.req.param("id"));
  const [row] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.userId, scope)));
  if (!row) return c.json({ error: "Contato não encontrado" }, 404);
  // Descadastrados são mantidos para que o opt-out continue valendo.
  if (row.optedOut) return c.json({ error: "Contatos descadastrados são mantidos para garantir que não recebam mensagens" }, 400);
  await db.delete(contacts).where(eq(contacts.id, id));
  return c.json({ ok: true });
});

export const groupRoutes = new Hono<AppEnv>();

groupRoutes.get("/", async (c) => {
  const scope = c.get("scopeUserId");
  const list = await db.select({
    id: waGroups.id, jid: waGroups.jid, subject: waGroups.subject, size: waGroups.size,
    imgUrl: waGroups.imgUrl, announce: waGroups.announce, isAdmin: waGroups.isAdmin,
  }).from(waGroups).where(eq(waGroups.userId, scope)).orderBy(asc(waGroups.subject));
  return c.json({ groups: list.map((g) => ({ ...g, imgUrl: imgOrNull(g.imgUrl), canSend: !g.announce || g.isAdmin })) });
});

export const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.get("/", async (c) => c.json({ settings: await getSettings(c.get("scopeUserId")) }));

settingsRoutes.put("/", async (c) => {
  const scope = c.get("scopeUserId");
  const b = await c.req.json().catch(() => ({}));
  const int = (v: unknown, min: number, max: number, def: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const cur = await getSettings(scope);
  const minDelaySec = int(b.minDelaySec, 3, 600, cur.minDelaySec);
  const maxDelaySec = Math.max(minDelaySec, int(b.maxDelaySec, 3, 900, cur.maxDelaySec));
  let timezone = cur.timezone;
  if (typeof b.timezone === "string") {
    try { new Intl.DateTimeFormat("pt-BR", { timeZone: b.timezone }); timezone = b.timezone; } catch { return c.json({ error: "Fuso horário inválido" }, 400); }
  }
  const values = {
    minDelaySec, maxDelaySec,
    dailyLimit: int(b.dailyLimit, 1, 5000, cur.dailyLimit),
    batchSize: int(b.batchSize, 0, 1000, cur.batchSize),
    batchPauseSec: int(b.batchPauseSec, 0, 3600, cur.batchPauseSec),
    optOutKeywords: typeof b.optOutKeywords === "string" && b.optOutKeywords.trim() ? b.optOutKeywords.trim().slice(0, 300) : cur.optOutKeywords,
    optOutFooter: typeof b.optOutFooter === "string" ? b.optOutFooter.trim().slice(0, 300) : cur.optOutFooter,
    timezone,
    updatedAt: new Date(),
  };
  await db.update(userSettings).set(values).where(eq(userSettings.userId, scope));
  await logActivity({ userId: scope, actorId: c.get("user").id, action: "settings.updated" });
  return c.json({ settings: await getSettings(scope) });
});
