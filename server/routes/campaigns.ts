import { Hono } from "hono";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, campaigns, campaignRecipients, contacts, waGroups, waConnections } from "../../db/index.js";
import type { AppEnv } from "../lib/auth.js";
import { getSettings, logActivity, rows } from "../lib/store.js";
import { campaignCounts, summarize, userStats } from "../lib/stats.js";
import { kickUser, mediaStore } from "../worker.js";

export const campaignRoutes = new Hono<AppEnv>();

const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
const MAX_RECIPIENTS = 5000;

function mediaKind(mime: string): "image" | "video" | "document" {
  if (["image/jpeg", "image/png", "image/webp"].includes(mime)) return "image";
  if (["video/mp4", "video/3gpp"].includes(mime)) return "video";
  return "document";
}

campaignRoutes.post("/media", async (c) => {
  const scope = c.get("scopeUserId");
  const form = await c.req.parseBody().catch(() => null);
  const file = form?.file;
  if (!file || typeof file === "string") return c.json({ error: "Nenhum arquivo enviado" }, 400);
  if (file.size > MAX_MEDIA_BYTES) return c.json({ error: "Arquivo maior que 15 MB" }, 413);
  const mime = file.type || "application/octet-stream";
  const key = `${scope}/${randomUUID()}`;
  await mediaStore().set(key, await file.arrayBuffer(), { metadata: { mime, name: file.name, userId: scope } });
  return c.json({ media: { key, type: mediaKind(mime), name: file.name.slice(0, 200), mime, size: file.size } });
});

campaignRoutes.get("/media/:a/:b", async (c) => {
  const scope = c.get("scopeUserId");
  const key = `${c.req.param("a")}/${c.req.param("b")}`;
  if (!key.startsWith(`${scope}/`)) return c.json({ error: "Não encontrado" }, 404);
  const entry = await mediaStore().getWithMetadata(key, { type: "arrayBuffer" });
  if (!entry) return c.json({ error: "Não encontrado" }, 404);
  const mime = String((entry.metadata as any)?.mime ?? "application/octet-stream");
  return new Response(entry.data, { headers: { "content-type": mime, "cache-control": "private, max-age=3600" } });
});

campaignRoutes.get("/", async (c) => {
  const scope = c.get("scopeUserId");
  const list = await db.select().from(campaigns).where(eq(campaigns.userId, scope)).orderBy(desc(campaigns.createdAt)).limit(200);
  const counts = await campaignCounts(list.map((x) => x.id));
  return c.json({
    campaigns: list.map((x) => ({
      id: x.id, name: x.name, message: x.message, status: x.status, createdAt: x.createdAt, finishedAt: x.finishedAt,
      mediaType: x.mediaType, mediaName: x.mediaName, lastError: x.lastError, nextRunAt: x.nextRunAt,
      stats: summarize(counts.get(x.id)!, x.totalRecipients),
    })),
  });
});

campaignRoutes.post("/", async (c) => {
  const scope = c.get("scopeUserId");
  const actor = c.get("user");
  const b = await c.req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim().slice(0, 120);
  const message = String(b.message ?? "").slice(0, 4096);
  const contactIds: number[] = Array.isArray(b.contactIds) ? b.contactIds.map(Number).filter(Number.isInteger) : [];
  const groupIds: number[] = Array.isArray(b.groupIds) ? b.groupIds.map(Number).filter(Number.isInteger) : [];
  const media = b.media && typeof b.media.key === "string" ? b.media : null;

  if (!name) return c.json({ error: "Dê um nome para a campanha" }, 400);
  if (!message.trim() && !media) return c.json({ error: "Escreva a mensagem ou anexe um arquivo" }, 400);
  if (!contactIds.length && !groupIds.length) return c.json({ error: "Selecione ao menos um contato ou grupo" }, 400);
  if (contactIds.length + groupIds.length > MAX_RECIPIENTS) return c.json({ error: `Máximo de ${MAX_RECIPIENTS} destinatários por campanha` }, 400);
  if (b.consent !== true) return c.json({ error: "Confirme que os destinatários autorizaram o recebimento" }, 400);
  if (media && !media.key.startsWith(`${scope}/`)) return c.json({ error: "Mídia inválida" }, 400);

  const [wa] = await db.select({ registered: waConnections.registered, status: waConnections.status }).from(waConnections).where(eq(waConnections.userId, scope));
  if (!wa?.registered || wa.status !== "connected") return c.json({ error: "Conecte o WhatsApp antes de iniciar um disparo" }, 412);

  const selContacts = contactIds.length
    ? await db.select().from(contacts).where(and(eq(contacts.userId, scope), inArray(contacts.id, contactIds), eq(contacts.optedOut, false)))
    : [];
  const selGroups = groupIds.length
    ? await db.select().from(waGroups).where(and(eq(waGroups.userId, scope), inArray(waGroups.id, groupIds)))
    : [];
  const recipients = [
    ...selContacts.map((x) => ({ kind: "contact", jid: x.jid, name: x.name ?? x.notify, phone: x.phone })),
    ...selGroups.map((g) => ({ kind: "group", jid: g.jid, name: g.subject, phone: null as string | null })),
  ];
  // Remove duplicados (mesmo JID).
  const seen = new Set<string>();
  const unique = recipients.filter((r) => (seen.has(r.jid) ? false : (seen.add(r.jid), true)));
  if (!unique.length) return c.json({ error: "Nenhum destinatário válido (contatos descadastrados são ignorados)" }, 400);

  const settings = await getSettings(scope);
  const minDelaySec = Math.max(3, Math.round(Number(b.minDelaySec ?? settings.minDelaySec)) || settings.minDelaySec);
  const maxDelaySec = Math.max(minDelaySec, Math.round(Number(b.maxDelaySec ?? settings.maxDelaySec)) || settings.maxDelaySec);

  const [camp] = await db.insert(campaigns).values({
    userId: scope,
    createdBy: actor.id,
    name,
    message,
    mediaKey: media?.key ?? null,
    mediaType: media ? mediaKind(String(media.mime ?? "")) : null,
    mediaName: media ? String(media.name ?? "arquivo").slice(0, 200) : null,
    mediaMime: media ? String(media.mime ?? "application/octet-stream") : null,
    fallbackName: String(b.fallbackName ?? "").slice(0, 60),
    appendOptOut: b.appendOptOut !== false,
    status: "running",
    totalRecipients: unique.length,
    minDelaySec, maxDelaySec,
    nextRunAt: new Date(),
  }).returning();

  for (let i = 0; i < unique.length; i += 500) {
    await db.insert(campaignRecipients).values(unique.slice(i, i + 500).map((r) => ({ ...r, campaignId: camp.id, userId: scope })));
  }
  await logActivity({ userId: scope, actorId: actor.id, action: "campaign.started", details: { campaignId: camp.id, name, recipients: unique.length, contacts: selContacts.length, groups: selGroups.length } });
  kickUser(scope);
  return c.json({ campaign: { id: camp.id } }, 201);
});

campaignRoutes.get("/:id", async (c) => {
  const scope = c.get("scopeUserId");
  const id = Number(c.req.param("id"));
  const [camp] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.userId, scope)));
  if (!camp) return c.json({ error: "Campanha não encontrada" }, 404);
  if (camp.status === "running") kickUser(scope); // o acompanhamento ao vivo também move a fila
  const counts = await campaignCounts([id]);
  const status = c.req.query("status");
  const q = (c.req.query("q") ?? "").trim();
  const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
  const pageSize = 50;
  const conds = [eq(campaignRecipients.campaignId, id)];
  if (status === "sent") conds.push(inArray(campaignRecipients.status, ["sent", "delivered", "read"]));
  else if (status && ["pending", "failed", "skipped", "delivered", "read"].includes(status)) conds.push(eq(campaignRecipients.status, status));
  if (q) {
    const digits = q.replace(/\D/g, "");
    conds.push(digits.length >= 3
      ? sql`(${campaignRecipients.name} ilike ${"%" + q + "%"} or ${campaignRecipients.phone} like ${"%" + digits + "%"})`
      : sql`${campaignRecipients.name} ilike ${"%" + q + "%"}`);
  }
  const where = and(...conds);
  const [{ n }] = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from campaign_recipients where ${where}`));
  const recipients = await db.select({
    id: campaignRecipients.id, kind: campaignRecipients.kind, name: campaignRecipients.name, phone: campaignRecipients.phone,
    status: campaignRecipients.status, error: campaignRecipients.error, sentAt: campaignRecipients.sentAt, deliveredAt: campaignRecipients.deliveredAt,
  }).from(campaignRecipients).where(where).orderBy(campaignRecipients.id).limit(pageSize).offset((page - 1) * pageSize);
  const settings = await getSettings(scope);
  return c.json({
    campaign: {
      id: camp.id, name: camp.name, message: camp.message, status: camp.status, createdAt: camp.createdAt, startedAt: camp.startedAt,
      finishedAt: camp.finishedAt, mediaType: camp.mediaType, mediaName: camp.mediaName, mediaKey: camp.mediaKey, mediaMime: camp.mediaMime,
      minDelaySec: camp.minDelaySec, maxDelaySec: camp.maxDelaySec, appendOptOut: camp.appendOptOut, fallbackName: camp.fallbackName,
      lastError: camp.lastError, nextRunAt: camp.nextRunAt,
      stats: summarize(counts.get(id)!, camp.totalRecipients),
      footer: camp.appendOptOut ? settings.optOutFooter : null,
      timezone: settings.timezone,
    },
    recipients, total: Number(n), page, pageSize,
  });
});

async function setStatus(c: any, from: string[], to: string, action: string) {
  const scope = c.get("scopeUserId");
  const id = Number(c.req.param("id"));
  const extra: Record<string, unknown> = {};
  if (to === "cancelled") extra.finishedAt = new Date();
  if (to === "running") { extra.nextRunAt = new Date(); extra.lastError = null; }
  const [row] = await db.update(campaigns).set({ status: to, ...extra })
    .where(and(eq(campaigns.id, id), eq(campaigns.userId, scope), inArray(campaigns.status, from))).returning({ id: campaigns.id });
  if (!row) return c.json({ error: "Não é possível alterar o status desta campanha agora" }, 409);
  if (to === "cancelled") {
    await db.update(campaignRecipients).set({ status: "skipped", error: "Campanha cancelada", updatedAt: new Date() })
      .where(and(eq(campaignRecipients.campaignId, id), eq(campaignRecipients.status, "pending")));
  }
  if (to === "running") kickUser(scope);
  await logActivity({ userId: scope, actorId: c.get("user").id, action, details: { campaignId: id } });
  return c.json({ ok: true });
}

campaignRoutes.post("/:id/pause", (c) => setStatus(c, ["running"], "paused", "campaign.paused"));
campaignRoutes.post("/:id/resume", (c) => setStatus(c, ["paused"], "running", "campaign.resumed"));
campaignRoutes.post("/:id/cancel", (c) => setStatus(c, ["running", "paused"], "cancelled", "campaign.cancelled"));

export const dashboardRoutes = new Hono<AppEnv>();

dashboardRoutes.get("/", async (c) => {
  const scope = c.get("scopeUserId");
  const settings = await getSettings(scope);
  const stats = await userStats(scope, settings.timezone);
  const recent = await db.select().from(campaigns).where(eq(campaigns.userId, scope)).orderBy(desc(campaigns.createdAt)).limit(6);
  const counts = await campaignCounts(recent.map((x) => x.id));
  const [wa] = await db.select().from(waConnections).where(eq(waConnections.userId, scope));
  return c.json({
    stats,
    whatsapp: {
      status: wa?.status ?? "disconnected",
      connected: !!wa?.registered && wa?.status === "connected",
      phone: wa?.phone ?? null, pushName: wa?.pushName ?? null, profilePicUrl: wa?.profilePicUrl ?? null,
      lastConnectedAt: wa?.lastConnectedAt ?? null, lastSyncAt: wa?.lastSyncAt ?? null, lastError: wa?.lastError ?? null,
    },
    recent: recent.map((x) => ({ id: x.id, name: x.name, status: x.status, createdAt: x.createdAt, stats: summarize(counts.get(x.id)!, x.totalRecipients) })),
  });
});
