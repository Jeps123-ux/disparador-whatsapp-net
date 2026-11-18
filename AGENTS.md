# AGENTS.md

## Arquitetura
- `src/` — SPA React. `lib/api.ts` (fetch com cabeçalho `X-Requested-With: ecoa` e `X-View-As` para admin), `lib/session.tsx`, `pages/*`, `components/*`.
- `shared/template.ts` — motor de variáveis `{{nome}}` etc., usado no frontend (prévia) e backend (envio). Mantenha um só.
- `netlify/server/index.ts` — único entrypoint do Netlify Server (Hono, `path: /api/*`).
- `server/lib` — auth (cookie `ecoa_sid`, SHA-256 do token no banco, RBAC, CSRF), crypto (scrypt, AES-256-GCM), stats, store (bootstrap do admin inicial + logs).
- `server/wa` — `manager.ts` (sockets Baileys por usuário, lease no banco entre instâncias, reconexão), `authState.ts` (credenciais cifradas no Postgres), `store.ts` (contatos/grupos, mescla LID→PN).
- `server/worker.ts` — fila de envio: claim com `FOR UPDATE SKIP LOCKED`, intervalo aleatório, pausa por lote, limite diário, opt-out.
- `netlify/functions/campaign-tick.mts` — cron a cada minuto chama `/api/internal/tick` com token interno (`app_settings.worker_token`).
- `db/schema.ts` — schema Drizzle; gere migrações com `npx drizzle-kit generate --name <nome>`.

## Decisões não óbvias
- Servidor escala a zero: sockets do WhatsApp abrem sob demanda e são mantidos com `waitUntil`; nada persistente em memória.
- Admin pode "ver como" outro usuário (`X-View-As`), mas QR/código de pareamento e credenciais nunca são expostos nem pareados por ele (`ownerOnly`).
- Envios em `sending` interrompidos viram `failed` (nunca reenviados) para evitar duplicidade.
- Contatos descadastrados não podem ser apagados (o opt-out precisa persistir).
- Senha inicial do admin está só como hash scrypt em `server/lib/store.ts`.

## Convenções
- Textos de UI em português. Erros da API como `{ error: string }`.
- Toda query filtra por `scopeUserId` para isolamento.
- Não rodar builds; não aplicar migrações manualmente.
