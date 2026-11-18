import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, Activity, Users, Send, Megaphone, ShieldCheck } from "lucide-react";
import { fmtDate, fmtInt, formatPhone, timeAgo } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useSession } from "../lib/session";
import { Button, Card, PageHeader, Skeleton, Badge, ErrorNote, Empty, cx } from "../components/ui";
import { Overview } from "../components/Overview";
import type { AdminUser } from "./AdminUsers";

const ACTIONS: Record<string, string> = {
  "auth.login": "Entrou no sistema",
  "auth.login_failed": "Tentativa de login falhou",
  "auth.login_blocked": "Login bloqueado (usuário desativado)",
  "auth.password_changed": "Alterou a senha",
  "whatsapp.pairing_started": "Iniciou conexão do WhatsApp",
  "whatsapp.connected": "Conectou o WhatsApp",
  "whatsapp.reconnected": "Testou/reconectou o WhatsApp",
  "whatsapp.disconnected": "Desconectou o WhatsApp",
  "whatsapp.logged_out": "Sessão do WhatsApp encerrada pelo celular",
  "whatsapp.sync_requested": "Sincronizou contatos e grupos",
  "campaign.started": "Iniciou campanha",
  "campaign.paused": "Pausou campanha",
  "campaign.resumed": "Retomou campanha",
  "campaign.cancelled": "Cancelou campanha",
  "campaign.completed": "Campanha concluída",
  "campaign.auto_paused": "Campanha pausada automaticamente",
  "contact.opt_out": "Contato descadastrado",
  "contact.opt_in": "Contato reativado",
  "contact.created": "Adicionou contato",
  "settings.updated": "Atualizou configurações",
  "admin.user_created": "Usuário criado",
  "admin.user_updated": "Usuário editado",
  "admin.user_deleted": "Usuário excluído",
  "system.bootstrap_admin": "Administrador inicial criado",
};

function describe(l: any) {
  const d = l.details ?? {};
  const base = ACTIONS[l.action] ?? l.action;
  if (l.action === "campaign.started" && d.name) return `${base} “${d.name}” · ${d.recipients} destinatários`;
  if (l.action === "admin.user_updated" && d.changes?.length) return `${base}: ${d.changes.join(", ")}`;
  if (l.action === "contact.opt_out" && d.keyword) return `${base} por resposta “${d.keyword}”`;
  return base;
}

export function MonitorPage() {
  const nav = useNavigate();
  const { data, loading } = useApi<{ users: AdminUser[] }>("/admin/users", { poll: 15000 });
  const logs = useApi<{ logs: any[] }>("/admin/logs", { poll: 20000 });
  const users = data?.users ?? [];
  const totals = users.reduce((a, u) => ({ sent: a.sent + u.stats.sent, campaigns: a.campaigns + u.stats.campaigns, connected: a.connected + (u.whatsapp.connected ? 1 : 0) }), { sent: 0, campaigns: 0, connected: 0 });

  return (
    <>
      <PageHeader eyebrow="Administração" title="Monitoramento" subtitle="Acompanhe todos os números, campanhas e a atividade de cada usuário." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[[Users, "Usuários", users.length], [ShieldCheck, "WhatsApps conectados", totals.connected], [Megaphone, "Campanhas", totals.campaigns], [Send, "Mensagens enviadas", totals.sent]].map(([Icon, l, v]: any, i) => (
          <Card key={l} className="p-5 animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
            <div className="flex items-center justify-between text-[13px] text-ink-300">{l}<Icon className="size-4 text-ink-400" /></div>
            <div className="mt-3 font-display text-3xl font-semibold">{fmtInt(v)}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr] items-start">
        <div className="grid sm:grid-cols-2 gap-4">
          {loading && !data && [...Array(4)].map((_, i) => <Skeleton key={i} className="h-44" />)}
          {users.map((u, i) => (
            <button key={u.id} onClick={() => nav(`/admin/monitoramento/${u.id}`)} className="text-left animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
              <Card className={cx("p-5 h-full hover:!border-leaf-500/25 hover:-translate-y-0.5 transition-all", !u.active && "opacity-55")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{u.name}</div>
                    <div className="text-xs text-ink-400">@{u.username} · {u.role === "admin" ? "admin" : "usuário"}{!u.active && " · desativado"}</div>
                  </div>
                  <Badge tone={u.whatsapp.connected ? "green" : "rose"}>{u.whatsapp.connected ? "conectado" : "desconectado"}</Badge>
                </div>
                <div className="mt-3 font-mono text-sm text-ink-200">{u.whatsapp.phone ? formatPhone(u.whatsapp.phone) : "—"}</div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[["Contatos", u.stats.contacts], ["Campanhas", u.stats.campaigns], ["Enviadas", u.stats.sent]].map(([l, v]) => (
                    <div key={l as string} className="rounded-xl bg-ink-900/70 border border-white/5 py-2"><div className="font-mono">{fmtInt(v as number)}</div><div className="text-[10.5px] text-ink-400">{l}</div></div>
                  ))}
                </div>
                <div className="mt-3 text-[11.5px] text-ink-400">Último acesso {timeAgo(u.lastLoginAt)}</div>
              </Card>
            </button>
          ))}
        </div>
        <Card className="animate-rise">
          <div className="px-5 pt-5 pb-3 flex items-center gap-2"><Activity className="size-4 text-leaf-400" /><h3 className="font-display font-semibold">Atividade recente</h3></div>
          <ul className="max-h-[640px] overflow-y-auto divide-y divide-white/[0.04]">
            {(logs.data?.logs ?? []).map((l) => (
              <li key={l.id} className="px-5 py-3 text-sm">
                <div className="text-ink-200">{describe(l)}</div>
                <div className="mt-0.5 text-xs text-ink-400">
                  {l.user_username ? `@${l.user_username}` : "sistema"}{l.actor_username && l.actor_username !== l.user_username ? ` · por @${l.actor_username}` : ""} · {fmtDate(l.created_at)}
                </div>
              </li>
            ))}
            {logs.data && logs.data.logs.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-400">Sem atividade registrada.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}

export function MonitorUserPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { me, viewAs } = useSession();
  const { data, error } = useApi<any>(`/admin/users/${id}`, { poll: 10000 });
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /></div>;
  const u = data.user;
  const isSelf = Number(id) === me?.user.id;
  return (
    <>
      <Link to="/admin/monitoramento" className="inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100 mb-4"><ArrowLeft className="size-4" /> Monitoramento</Link>
      <PageHeader eyebrow={u.role === "admin" ? "Administrador" : "Usuário"} title={u.name} subtitle={`@${u.username} · criado em ${fmtDate(u.createdAt, false)} · último acesso ${timeAgo(u.lastLoginAt)}${u.active ? "" : " · desativado"}`}
        actions={!isSelf && <Button icon={<Eye className="size-4" />} onClick={async () => { await viewAs(u.id); nav("/"); }}>Acessar painel do usuário</Button>} />
      <Overview stats={data.stats} recent={data.campaigns} wa={data.whatsapp} linkBase={null} linkable={false} />
      <Card className="mt-5">
        <div className="px-6 pt-5 pb-3"><h3 className="font-display text-lg font-semibold">Histórico de utilização</h3></div>
        {data.logs.length === 0 ? <Empty icon={<Activity className="size-6" />} title="Sem atividade" /> : (
          <ul className="divide-y divide-white/[0.04]">
            {data.logs.map((l: any) => (
              <li key={l.id} className="px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm">
                <span className="text-ink-200">{describe(l)}</span>
                <span className="text-xs text-ink-400 font-mono">{fmtDate(l.createdAt)}{l.ip ? ` · ${l.ip}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
