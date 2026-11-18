import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { rows } from "./store.js";

export type Counts = { pending: number; sending: number; sent: number; delivered: number; read: number; failed: number; skipped: number };
const empty = (): Counts => ({ pending: 0, sending: 0, sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0 });

/** Contagem de destinatários por status para várias campanhas de uma vez. */
export async function campaignCounts(ids: number[]): Promise<Map<number, Counts>> {
  const map = new Map<number, Counts>();
  for (const id of ids) map.set(id, empty());
  if (!ids.length) return map;
  const res = await db.execute(sql`
    select campaign_id, status, count(*)::int as n from campaign_recipients
    where campaign_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
    group by campaign_id, status`);
  for (const r of rows<{ campaign_id: number; status: keyof Counts; n: number }>(res)) {
    const m = map.get(Number(r.campaign_id));
    if (m && r.status in m) m[r.status] = Number(r.n);
  }
  return map;
}

/** Resumo amigável para a interface: "enviadas" inclui entregues e lidas. */
export function summarize(c: Counts, total: number) {
  const sentTotal = c.sent + c.delivered + c.read;
  const done = sentTotal + c.failed + c.skipped;
  return {
    total,
    sent: sentTotal,
    delivered: c.delivered + c.read,
    read: c.read,
    failed: c.failed,
    skipped: c.skipped,
    pending: c.pending + c.sending,
    progress: total ? Math.round((done / total) * 1000) / 10 : 0,
  };
}

/** Estatísticas consolidadas de um usuário (dashboard e monitoramento do admin). */
export async function userStats(userId: number, timeZone: string) {
  const [totals] = rows<any>(await db.execute(sql`
    select
      (select count(*)::int from contacts where user_id = ${userId} and opted_out = false) as contacts,
      (select count(*)::int from contacts where user_id = ${userId} and opted_out = true) as opted_out,
      (select count(*)::int from wa_groups where user_id = ${userId}) as groups,
      (select count(*)::int from campaigns where user_id = ${userId}) as campaigns,
      (select count(*)::int from campaigns where user_id = ${userId} and status in ('running','paused')) as active_campaigns,
      (select count(*)::int from campaign_recipients where user_id = ${userId} and status in ('sent','delivered','read')) as sent,
      (select count(*)::int from campaign_recipients where user_id = ${userId} and status in ('delivered','read')) as delivered,
      (select count(*)::int from campaign_recipients where user_id = ${userId} and status = 'read') as read,
      (select count(*)::int from campaign_recipients where user_id = ${userId} and status = 'failed') as failed,
      (select count(*)::int from campaign_recipients where user_id = ${userId} and status in ('pending','sending')) as pending
  `));
  const series = rows<{ day: string; sent: number; failed: number }>(await db.execute(sql`
    with days as (
      select generate_series(
        (date_trunc('day', now() at time zone ${timeZone}) - interval '13 days')::date,
        (date_trunc('day', now() at time zone ${timeZone}))::date,
        interval '1 day')::date as day
    )
    select to_char(d.day, 'YYYY-MM-DD') as day,
      coalesce(sum(case when r.status in ('sent','delivered','read') then 1 else 0 end), 0)::int as sent,
      coalesce(sum(case when r.status = 'failed' then 1 else 0 end), 0)::int as failed
    from days d
    left join campaign_recipients r
      on r.user_id = ${userId}
      and r.status in ('sent','delivered','read','failed')
      and (coalesce(r.sent_at, r.updated_at) at time zone ${timeZone})::date = d.day
    group by d.day order by d.day`));
  const num = (v: unknown) => Number(v ?? 0);
  return {
    contacts: num(totals?.contacts),
    optedOut: num(totals?.opted_out),
    groups: num(totals?.groups),
    campaigns: num(totals?.campaigns),
    activeCampaigns: num(totals?.active_campaigns),
    sent: num(totals?.sent),
    delivered: num(totals?.delivered),
    read: num(totals?.read),
    failed: num(totals?.failed),
    pending: num(totals?.pending),
    series: series.map((s) => ({ day: s.day, sent: num(s.sent), failed: num(s.failed) })),
  };
}
