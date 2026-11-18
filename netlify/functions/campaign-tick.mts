import type { Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";

/**
 * Executa a cada minuto: se houver campanhas em andamento, acorda o Netlify Server
 * para que ele continue processando a fila de envios (com os intervalos configurados).
 * Sem campanhas ativas, não faz nenhuma chamada — o servidor pode escalar para zero.
 */
export default async () => {
  const db = getDatabase();
  const active = await db.sql`
    select 1 from campaigns
    where status = 'running' and next_run_at <= now() + interval '55 seconds'
    limit 1`;
  if (!active.length) return;
  const [token] = await db.sql`select value from app_settings where key = 'worker_token'`;
  if (!token) return;
  const base = process.env.URL ?? process.env.DEPLOY_PRIME_URL;
  if (!base) return;
  const res = await fetch(`${base}/api/internal/tick`, {
    method: "POST",
    headers: { "x-worker-token": String(token.value) },
  });
  if (!res.ok) console.error("[campaign-tick] falha", res.status);
};

export const config: Config = {
  schedule: "* * * * *",
};
