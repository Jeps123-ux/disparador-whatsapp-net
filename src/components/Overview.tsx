import { Link } from "react-router-dom";
import { Users, UsersRound, Send, CheckCheck, XCircle, Megaphone, Smartphone, ArrowUpRight } from "lucide-react";
import { Card, StatusBadge, Avatar, Empty, cx } from "./ui";
import { DailyChart, DeliveryBar } from "./Charts";
import { fmtInt, fmtDate, formatPhone, timeAgo } from "../lib/api";

export type Stats = {
  contacts: number; optedOut: number; groups: number; campaigns: number; activeCampaigns: number;
  sent: number; delivered: number; read: number; failed: number; pending: number;
  series: { day: string; sent: number; failed: number }[];
};
export type CampaignRow = { id: number; name: string; status: string; createdAt: string; stats: { total: number; sent: number; failed: number; progress: number; delivered: number } };

function Tile({ icon: Icon, label, value, hint, accent, delay }: { icon: any; label: string; value: string; hint?: string; accent?: boolean; delay: number }) {
  return (
    <Card className={cx("p-5 animate-rise group hover:border-white/10 transition-colors", accent && "!border-leaf-500/20")} style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink-300">{label}</span>
        <Icon className={cx("size-4", accent ? "text-leaf-400" : "text-ink-400")} />
      </div>
      <div className="mt-3 font-display text-[34px] font-semibold leading-none tracking-tight">{value}</div>
      {hint && <div className="mt-2 text-xs text-ink-400">{hint}</div>}
    </Card>
  );
}

export function WhatsAppCard({ wa, linkable = true }: { wa: { connected: boolean; phone: string | null; pushName: string | null; profilePicUrl?: string | null; lastConnectedAt?: string | null; lastSyncAt?: string | null; lastError?: string | null; status: string }; linkable?: boolean }) {
  return (
    <Card className="relative overflow-hidden p-6 animate-rise">
      <div className="absolute -right-16 -top-16 size-56 rounded-full bg-leaf-500/8 blur-3xl pointer-events-none" />
      <div className="relative flex items-start gap-4">
        {wa.connected ? <Avatar name={wa.pushName ?? wa.phone} src={wa.profilePicUrl} size={52} /> : (
          <div className="grid place-items-center size-[52px] rounded-full bg-ink-800 text-ink-400"><Smartphone className="size-6" /></div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]">
            <span className={cx("size-2 rounded-full", wa.connected ? "bg-leaf-500 live-dot" : "bg-rose-soft")} />
            <span className={wa.connected ? "text-leaf-300" : "text-rose-soft"}>{wa.connected ? "Conectado" : wa.status === "logged_out" ? "Sessão encerrada" : "Desconectado"}</span>
          </div>
          <div className="mt-1.5 font-mono text-xl text-ink-100 truncate">{wa.phone ? formatPhone(wa.phone) : "Nenhum número conectado"}</div>
          {wa.pushName && <div className="text-sm text-ink-300 truncate">{wa.pushName}</div>}
        </div>
      </div>
      <dl className="relative mt-5 grid grid-cols-2 gap-3 text-xs">
        <div><dt className="text-ink-400">Última conexão</dt><dd className="mt-0.5 text-ink-200">{timeAgo(wa.lastConnectedAt)}</dd></div>
        <div><dt className="text-ink-400">Última sincronização</dt><dd className="mt-0.5 text-ink-200">{timeAgo(wa.lastSyncAt)}</dd></div>
      </dl>
      {wa.lastError && !wa.connected && <p className="relative mt-4 text-xs text-amber-soft">{wa.lastError}</p>}
      {linkable && (
        <Link to="/conexao" className="relative mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-leaf-400 hover:text-leaf-300">
          {wa.connected ? "Gerenciar conexão" : "Conectar agora"} <ArrowUpRight className="size-4" />
        </Link>
      )}
    </Card>
  );
}

export function Overview({ stats, recent, wa, linkBase = "/historico", linkable = true }: { stats: Stats; recent: CampaignRow[]; wa: any; linkBase?: string | null; linkable?: boolean }) {
  const deliveryRate = stats.sent ? Math.round((stats.delivered / stats.sent) * 1000) / 10 : 0;
  const total14 = stats.series.reduce((a, s) => a + s.sent, 0);
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(320px,380px)_1fr]">
        <WhatsAppCard wa={wa} linkable={linkable} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          <Tile icon={Users} label="Contatos" value={fmtInt(stats.contacts)} hint={stats.optedOut ? `${fmtInt(stats.optedOut)} descadastrados` : "aptos a receber"} delay={40} />
          <Tile icon={UsersRound} label="Grupos" value={fmtInt(stats.groups)} hint="na conta conectada" delay={80} />
          <Tile icon={Megaphone} label="Campanhas" value={fmtInt(stats.campaigns)} hint={stats.activeCampaigns ? `${stats.activeCampaigns} em andamento/pausadas` : "realizadas"} delay={120} />
          <Tile icon={Send} label="Enviadas" value={fmtInt(stats.sent)} hint={stats.pending ? `${fmtInt(stats.pending)} na fila` : "total"} accent delay={160} />
          <Tile icon={CheckCheck} label="Entregues" value={fmtInt(stats.delivered)} hint={stats.sent ? `${deliveryRate.toString().replace(".", ",")}% das enviadas` : "confirmadas pelo WhatsApp"} delay={200} />
          <Tile icon={XCircle} label="Com falha" value={fmtInt(stats.failed)} hint="não puderam ser enviadas" delay={240} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_minmax(320px,380px)]">
        <Card className="p-6 animate-rise" style={{ animationDelay: "200ms" }}>
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h3 className="font-display text-lg font-semibold">Mensagens enviadas por dia</h3>
              <p className="text-sm text-ink-400">Últimos 14 dias</p>
            </div>
            <div className="text-right">
              <div className="font-display text-2xl font-semibold">{fmtInt(total14)}</div>
              <div className="text-xs text-ink-400">no período</div>
            </div>
          </div>
          <div className="mt-4"><DailyChart data={stats.series} /></div>
        </Card>
        <Card className="p-6 animate-rise" style={{ animationDelay: "260ms" }}>
          <h3 className="font-display text-lg font-semibold">Situação das mensagens</h3>
          <p className="text-sm text-ink-400 mb-5">Confirmações de entrega chegam enquanto o número está conectado.</p>
          <DeliveryBar delivered={stats.delivered} sent={stats.sent} failed={stats.failed} pending={stats.pending} />
        </Card>
      </div>

      <Card className="animate-rise" style={{ animationDelay: "300ms" }}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 className="font-display text-lg font-semibold">Últimos disparos</h3>
          {linkBase && <Link to={linkBase} className="text-sm font-semibold text-leaf-400 hover:text-leaf-300">Ver histórico</Link>}
        </div>
        {recent.length === 0 ? (
          <Empty icon={<Send className="size-6" />} title="Nenhum disparo ainda">Quando você iniciar uma campanha, o progresso aparece aqui.</Empty>
        ) : (
          <ul className="divide-y divide-white/5">
            {recent.map((c) => {
              const inner = (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{c.name}</div>
                    <div className="text-xs text-ink-400">{fmtDate(c.createdAt)} · {fmtInt(c.stats.total)} destinatários</div>
                  </div>
                  <div className="hidden sm:block w-40">
                    <div className="h-1.5 rounded-full bg-ink-700 overflow-hidden"><div className="h-full bg-leaf-500 rounded-full" style={{ width: `${c.stats.progress}%` }} /></div>
                    <div className="mt-1 text-[11px] text-ink-400 font-mono">{fmtInt(c.stats.sent)} enviadas · {fmtInt(c.stats.failed)} falhas</div>
                  </div>
                  <StatusBadge status={c.status} />
                </>
              );
              return (
                <li key={c.id}>
                  {linkBase ? (
                    <Link to={`${linkBase}/${c.id}`} className="flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.02] transition-colors">{inner}</Link>
                  ) : <div className="flex items-center gap-4 px-6 py-3.5">{inner}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
