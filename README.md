# Ecoa — Gestão de disparos no WhatsApp

Plataforma multiusuário para conectar números de WhatsApp (QR Code ou código de pareamento), importar contatos e grupos e enviar campanhas personalizadas com fila, intervalos, limites diários e descadastro.

## Tecnologias
- **Frontend:** React 19 + Vite + Tailwind CSS 4, React Router, TanStack Virtual (listas grandes), lucide-react.
- **Backend:** Hono rodando como Netlify Server (`netlify/server/index.ts`).
- **Banco:** Netlify Database (Postgres) com Drizzle ORM; migrações em `netlify/database/migrations`.
- **Arquivos:** Netlify Blobs (mídias das campanhas e chave-mestra de criptografia).
- **WhatsApp:** Baileys (protocolo multidispositivo do WhatsApp Web).
- **Fila:** função agendada `campaign-tick` (a cada minuto) que retoma campanhas em andamento.

## Rodando localmente
```bash
npm install
netlify dev --port 8889
```
Acesse http://localhost:8889 e entre com o administrador inicial `enrico` (senha inicial fornecida no briefing — altere-a em Configurações após o primeiro acesso).

## Configuração
- `SESSION_ENCRYPTION_KEY` (recomendado): segredo longo e aleatório usado para cifrar as sessões do WhatsApp. Sem ele, uma chave é gerada e guardada no Netlify Blobs.
- `WA_LOG_LEVEL` (opcional): nível de log do Baileys (padrão `error`).

Banco, Blobs e migrações são provisionados automaticamente pela Netlify no deploy.

## Aviso sobre a integração
Baileys não é a API oficial do WhatsApp Business. Envios em massa para quem não autorizou podem levar a restrição do número. Use intervalos generosos e mantenha o descadastro ativo.
