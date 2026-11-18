import { and, eq, sql } from "drizzle-orm";
import { getStore } from "@netlify/blobs";
import { getContext } from "@netlify/server";
import { db, campaigns, campaignRecipients, contacts, waGroups } from "../db/index.js";
import { ensureConnected, hold, isLive, WaError, INSTANCE_ID } from "./wa/manager.js";
import { composeMessage } from "../shared/template.js";
import { rows, getSettings, logActivity } from "./lib/store.js";

const activeUsers = new Set<number>();
const mediaCache = new Map<string, Buffer>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mediaStore = () => getStore({ name: "campaign-media", consistency: "strong" });

/** Dispara o processamento da fila de um usuário (idempotente por instância). */
export function kickUser(userId: number, budgetMs = 50_000) {
  if (activeUsers.has(userId)) return;
  activeUsers.add(userId);
  const p = runUser(userId, Date.now() + budgetMs)
    .catch((e) => console.error("[worker] erro", userId, e))
    .finally(() => activeUsers.delete(userId));
  try { getContext().waitUntil(p); } catch { /* fora de requisição */ }
}

/** Chamado pela função agendada (a cada minuto): retoma todas as campanhas em andamento. */
export async function tick() {
  const res = await db.execute(sql`
    select distinct user_id from campaigns
    where status = 'running' and next_run_at <= now() + interval '55 seconds'
      and (lease_until is null or lease_until < now() or lease_owner = ${INSTANCE_ID})`);
  const ids = rows<{ user_id: number }>(res).map((r) => Number(r.user_id));
  for (const id of ids) kickUser(id, 55_000);
  return ids.length;
}

async function leaseCampaign(id: number) {
  const res = await db.execute(sql`
    update campaigns set lease_owner = ${INSTANCE_ID}, lease_until = now() + interval '90 seconds'
    where id = ${id} and status = 'running' and (lease_until is null or lease_until < now() or lease_owner = ${INSTANCE_ID})
    returning id`);
  return rows(res).length > 0;
}

async function finalizeIfDone(campaignId: number) {
  const res = await db.execute(sql`
    update campaigns set status = 'completed', finished_at = now(), lease_owner = null, lease_until = null
    where id = ${campaignId} and status = 'running'
      and not exists (select 1 from campaign_recipients where campaign_id = ${campaignId} and status in ('pending', 'sending'))
    returning user_id`);
  const done = rows<{ user_id: number }>(res)[0];
  if (done) await logActivity({ userId: Number(done.user_id), action: "campaign.completed", details: { campaignId } });
  return !!done;
}

async function loadMedia(key: string): Promise<Buffer | null> {
  const cached = mediaCache.get(key);
  if (cached) return cached;
  const data = await mediaStore().get(key, { type: "arrayBuffer" });
  if (!data) return null;
  const buf = Buffer.from(data);
  if (mediaCache.size > 8) mediaCache.clear();
  mediaCache.set(key, buf);
  return buf;
}

async function runUser(userId: number, deadline: number) {
  const settings = await getSettings(userId);
  let currentCampaign: number | null = null;
  try {
    while (Date.now() < deadline - 3000) {
      const [camp] = await db.select().from(campaigns)
        .where(and(eq(campaigns.userId, userId), eq(campaigns.status, "running")))
        .orderBy(campaigns.createdAt).limit(1);
      if (!camp) break;
      if (!(await leaseCampaign(camp.id))) break;
      currentCampaign = camp.id;

      // Envios interrompidos por queda do processo nunca são reenviados automaticamente (evita duplicidade).
      await db.execute(sql`
        update campaign_recipients set status = 'failed', error = 'Envio interrompido antes da confirmação', updated_at = now()
        where campaign_id = ${camp.id} and status = 'sending' and updated_at < now() - interval '2 minutes'`);

      const waitMs = new Date(camp.nextRunAt).getTime() - Date.now();
      if (waitMs > 0) {
        if (Date.now() + waitMs > deadline - 2000) break;
        const releaseWait = isLive(userId) ? hold(userId) : null;
        await sleep(waitMs);
        releaseWait?.();
      }
      const [fresh] = await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, camp.id));
      if (fresh?.status !== "running") continue;

      // Limite diário de envios por conta (proteção contra bloqueio).
      const today = await db.execute(sql`
        select count(*)::int as n from campaign_recipients
        where user_id = ${userId} and sent_at >= (date_trunc('day', now() at time zone ${settings.timezone}) at time zone ${settings.timezone})`);
      const sentToday = Number(rows<{ n: number }>(today)[0]?.n ?? 0);
      if (sentToday >= settings.dailyLimit) {
        await db.update(campaigns).set({
          nextRunAt: new Date(Date.now() + 30 * 60_000),
          lastError: `Limite diário de ${settings.dailyLimit} envios atingido. A campanha continua automaticamente no próximo dia.`,
        }).where(eq(campaigns.id, camp.id));
        break;
      }

      const claimed = await db.execute(sql`
        update campaign_recipients set status = 'sending', updated_at = now()
        where id = (
          select id from campaign_recipients where campaign_id = ${camp.id} and status = 'pending'
          order by id limit 1 for update skip locked
        ) returning id, kind, jid, name, phone`);
      const r = rows<{ id: number; kind: string; jid: string; name: string | null; phone: string | null }>(claimed)[0];
      if (!r) {
        await finalizeIfDone(camp.id);
        continue;
      }

      const mark = (status: string, extra: Record<string, unknown> = {}) =>
        db.update(campaignRecipients).set({ status, updatedAt: new Date(), ...extra }).where(eq(campaignRecipients.id, r.id));

      // Regras de consentimento: descadastrados nunca recebem.
      if (r.kind === "contact") {
        const [ct] = await db.select({ optedOut: contacts.optedOut }).from(contacts).where(and(eq(contacts.userId, userId), eq(contacts.jid, r.jid)));
        if (ct?.optedOut) { await mark("skipped", { error: "Contato descadastrado (opt-out)" }); continue; }
      } else {
        const [g] = await db.select({ announce: waGroups.announce, isAdmin: waGroups.isAdmin }).from(waGroups).where(and(eq(waGroups.userId, userId), eq(waGroups.jid, r.jid)));
        if (!g) { await mark("skipped", { error: "Grupo não está mais disponível na conta" }); continue; }
        if (g.announce && !g.isAdmin) { await mark("skipped", { error: "Somente administradores podem enviar neste grupo" }); continue; }
      }

      let sock;
      try {
        sock = await ensureConnected(userId, 60_000);
      } catch (e: any) {
        await mark("pending");
        if (e instanceof WaError && (e.code === "NOT_CONNECTED" || e.code === "LOGGED_OUT")) {
          await db.update(campaigns).set({ status: "paused", lastError: e.message, leaseOwner: null, leaseUntil: null }).where(eq(campaigns.id, camp.id));
          await logActivity({ userId, action: "campaign.auto_paused", details: { campaignId: camp.id, reason: e.message } });
        } else {
          await db.update(campaigns).set({ nextRunAt: new Date(Date.now() + 30_000), lastError: e?.message ?? "Falha de conexão" }).where(eq(campaigns.id, camp.id));
        }
        break;
      }

      const release = hold(userId);
      try {
        if (r.kind === "contact" && r.jid.endsWith("@s.whatsapp.net") && r.phone) {
          const check = await sock.onWhatsApp(r.phone).catch(() => null);
          if (check && check.length && !check[0]?.exists) {
            await mark("failed", { error: "Número não possui WhatsApp" });
            continue;
          }
        }
        const text = composeMessage(camp.message, { name: r.name, phone: r.phone }, {
          timeZone: settings.timezone,
          fallbackName: camp.fallbackName,
          footer: r.kind === "contact" && camp.appendOptOut ? settings.optOutFooter : null,
        });
        let content: any;
        if (camp.mediaKey) {
          const buf = await loadMedia(camp.mediaKey);
          if (!buf) throw new Error("Arquivo de mídia não encontrado");
          if (camp.mediaType === "image") content = { image: buf, caption: text || undefined, mimetype: camp.mediaMime ?? undefined };
          else if (camp.mediaType === "video") content = { video: buf, caption: text || undefined, mimetype: camp.mediaMime ?? undefined };
          else content = { document: buf, mimetype: camp.mediaMime ?? "application/octet-stream", fileName: camp.mediaName ?? "arquivo", caption: text || undefined };
        } else {
          content = { text };
        }
        const sent = await Promise.race([
          sock.sendMessage(r.jid, content),
          sleep(60_000).then(() => { throw new Error("Tempo esgotado no envio"); }),
        ]);
        await mark("sent", { waMessageId: (sent as any)?.key?.id ?? null, sentAt: new Date(), error: null });
      } catch (e: any) {
        await mark("failed", { error: String(e?.message ?? e).slice(0, 300) });
      } finally {
        release();
      }

      // Intervalo aleatório entre envios + pausa longa a cada lote.
      const processed = await db.execute(sql`
        select count(*)::int as n from campaign_recipients where campaign_id = ${camp.id} and status not in ('pending', 'sending')`);
      const n = Number(rows<{ n: number }>(processed)[0]?.n ?? 0);
      const min = Math.max(3, camp.minDelaySec);
      const max = Math.max(min, camp.maxDelaySec);
      let delay = (min + Math.random() * (max - min)) * 1000;
      if (settings.batchSize > 0 && n > 0 && n % settings.batchSize === 0) delay += settings.batchPauseSec * 1000;
      await db.update(campaigns).set({ nextRunAt: new Date(Date.now() + delay), lastError: null }).where(eq(campaigns.id, camp.id));
      await finalizeIfDone(camp.id);
    }
  } finally {
    if (currentCampaign) {
      await db.execute(sql`update campaigns set lease_owner = null, lease_until = null where id = ${currentCampaign} and lease_owner = ${INSTANCE_ID}`).catch(() => {});
    }
  }
}
