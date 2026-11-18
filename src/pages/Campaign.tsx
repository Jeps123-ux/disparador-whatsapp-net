import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Pause, Play, Square, Search, Users, UsersRound, AlertTriangle, Clock } from "lucide-react";
import { api, fmtDate, fmtInt, formatPhone } from "../lib/api";
import { useApi } from "../lib/useApi";
import { Button, Card, StatusBadge, Modal, Skeleton, ErrorNote, InfoNote, useToast, cx } from "../components/ui";
import { WaPreview } from "../components/WaPreview";

type Detail = {
  campaign: {
    id: number; name: string; message: string; status: string; createdAt: string; startedAt: string; finishedAt: string | null;
    mediaType: string | null; mediaName: string | null; mediaKey: string | null; minDelaySec: number; maxDelaySec: number;
    appendOptOut: boolean; lastError: string | null; nextRunAt: string; footer: string | null;
    stats: { total: number; sent: number; delivered: number; read: number; failed: number; skipped: number; pending: number; progress: number };
  };
  recipients: { id: number; kind: string; name: string | null; phone: string | null; status: string; error: string | null; sentAt: string | null }[];
  total: number; page: number; pageSize: number;
};

const TABS = [["", "Todos"], ["pending", "Pendentes"], ["sent", "Enviadas"], ["delivered", "Entregues"], ["read", "Lidas"], ["failed", "Falhas"], ["skipped", "Ignoradas"]] as const;

export default function CampaignPage() {
  const { id } = useParams();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const path = `/campaigns/${id}?status=${status}&q=${encodeURIComponent(search)}&page=${page}`;
  const { data, error, reload } = useApi<Detail>(path, { poll: 3000 });
  const c = data?.campaign;

  async function act(action: "pause" | "resume" | "cancel") {
    setBusy(action);
    try {
      await api(`/campaigns/${id}/${action}`, { method: "POST" });
      toast("success", action === "pause" ? "Campanha pausada." : action === "resume" ? "Campanha retomada." : "Campanha cancelada.");
      await reload(true);
    } catch (e: any) { toast("error", e.message); } finally { setBusy(null); setConfirmCancel(false); }
  }

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!c) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-48" /><Skeleton className="h-96" /></div>;

  const s = c.stats;
  const nextIn = Math.max(0, Math.round((new Date(c.nextRunAt).getTime() - Date.now()) / 1000));
  const totalPages = Math.max(1, Math.ceil(data!.total / data!.pageSize));

  return (
    <>
      <Link to="/historico" className="inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100 mb-4"><ArrowLeft className="size-4" /> Histórico</Link>
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6 animate-rise">
        <div>
          <div className="flex flex-wrap items-center gap-3"><h1 className="font-display text-[28px] sm:text-[32px] font-semibold tracking-tight leading-tight">{c.name}</h1><StatusBadge status={c.status} /></div>
          <p className="mt-1.5 text-sm text-ink-400">Iniciada em {fmtDate(c.startedAt)}{c.finishedAt ? ` · finalizada em ${fmtDate(c.finishedAt)}` : ""} · intervalo {c.minDelaySec}–{c.maxDelaySec}s</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.status === "running" && <Button variant="outline" icon={<Pause className="size-4" />} loading={busy === "pause"} onClick={() => act("pause")}>Pausar</Button>}
          {c.status === "paused" && <Button icon={<Play className="size-4" />} loading={busy === "resume"} onClick={() => act("resume")}>Retomar</Button>}
          {(c.status === "running" || c.status === "paused") && <Button variant="danger" icon={<Square className="size-4" />} onClick={() => setConfirmCancel(true)}>Cancelar</Button>}
        </div>
      </div>

      {c.lastError && (c.status === "running" || c.status === "paused") && <div className="mb-5"><InfoNote tone="amber">{c.lastError}</InfoNote></div>}

      <Card className="p-6 sm:p-7 mb-5 animate-rise">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm text-ink-400">Progresso</div>
            <div className="font-display text-5xl font-semibold tracking-tight mt-1">{s.progress.toLocaleString("pt-BR")}<span className="text-2xl text-ink-400">%</span></div>
          </div>
          {c.status === "running" && s.pending > 0 && (
            <div className="flex items-center gap-2 text-sm text-ink-300"><Clock className="size-4 text-leaf-400" /> {nextIn > 0 ? `próximo envio em ${nextIn}s` : "enviando…"}</div>
          )}
        </div>
        <div className="mt-5 h-4 rounded-full bg-ink-800 overflow-hidden flex gap-[2px]">
          <div className={cx("h-full bg-leaf-500 transition-all duration-700", c.status === "running" && "progress-stripes")} style={{ width: `${s.total ? (s.sent / s.total) * 100 : 0}%` }} />
          {s.failed > 0 && <div className="h-full bg-[#d03b3b] transition-all duration-700" style={{ width: `${(s.failed / s.total) * 100}%` }} />}
          {s.skipped > 0 && <div className="h-full bg-ink-500 transition-all duration-700" style={{ width: `${(s.skipped / s.total) * 100}%` }} />}
        </div>
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            ["Destinatários", s.total, "text-ink-100", "bg-white/20"],
            ["Enviadas", s.sent, "text-leaf-300", "bg-leaf-500"],
            ["Entregues", s.delivered, "text-leaf-300", "bg-leaf-400"],
            ["Pendentes", s.pending, "text-ink-200", "bg-ink-600"],
            ["Falhas", s.failed, "text-rose-soft", "bg-[#d03b3b]"],
            ["Ignoradas", s.skipped, "text-ink-300", "bg-ink-500"],
          ].map(([l, v, cls, dot]) => (
            <div key={l as string} className="rounded-xl border border-white/5 bg-ink-900/60 px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-ink-400"><span className={cx("size-2 rounded-sm", dot as string)} />{l}</div>
              <div className={cx("mt-1 font-mono text-2xl", cls as string)}>{fmtInt(v as number)}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[380px_1fr] items-start">
        <Card className="p-5 animate-rise">
          <h3 className="font-display font-semibold mb-3">Mensagem enviada</h3>
          <WaPreview
            text={c.message + (c.footer ? `\n\n_${c.footer}_` : "")}
            media={c.mediaType ? { type: c.mediaType, name: c.mediaName ?? "arquivo" } : null}
            imageUrl={c.mediaType === "image" && c.mediaKey ? `/api/campaigns/media/${c.mediaKey}` : null}
          />
          <p className="mt-3 text-xs text-ink-400">As variáveis destacadas foram substituídas pelos dados de cada destinatário no momento do envio.</p>
        </Card>

        <Card className="animate-rise">
          <div className="p-5 pb-3 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {TABS.map(([k, l]) => (
                <button key={k} onClick={() => { setStatus(k); setPage(1); }} className={cx("rounded-full px-3 py-1 text-[12.5px] font-semibold border transition-all", status === k ? "bg-leaf-500/12 border-leaf-500/30 text-leaf-300" : "border-white/8 text-ink-300 hover:text-ink-100")}>{l}</button>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); setSearch(q); setPage(1); }} className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-ink-400" />
              <input className="field !pl-10" placeholder="Buscar destinatário por nome ou número e tecle Enter" value={q} onChange={(e) => setQ(e.target.value)} />
            </form>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-ink-400 border-y border-white/5">
                <th className="px-5 py-2.5 font-medium">Destinatário</th><th className="px-3 py-2.5 font-medium">Status</th><th className="px-3 py-2.5 font-medium">Enviado em</th><th className="px-5 py-2.5 font-medium">Detalhe</th>
              </tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {data!.recipients.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.015]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        {r.kind === "group" ? <UsersRound className="size-4 text-ink-400 shrink-0" /> : <Users className="size-4 text-ink-400 shrink-0" />}
                        <div className="min-w-0"><div className="truncate max-w-[220px]">{r.name || "Sem nome"}</div>{r.phone && <div className="text-xs font-mono text-ink-400">{formatPhone(r.phone)}</div>}</div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-3 text-xs text-ink-300 whitespace-nowrap">{r.sentAt ? fmtDate(r.sentAt) : "—"}</td>
                    <td className="px-5 py-3 text-xs text-ink-400">{r.error ? <span className="inline-flex items-center gap-1.5 text-rose-soft/90"><AlertTriangle className="size-3.5 shrink-0" />{r.error}</span> : "—"}</td>
                  </tr>
                ))}
                {data!.recipients.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-ink-400">Nenhum destinatário neste filtro.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/5 text-xs text-ink-400">
            <span>{fmtInt(data!.total)} destinatário(s)</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
              <span className="font-mono">{page}/{totalPages}</span>
              <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Próxima</Button>
            </div>
          </div>
        </Card>
      </div>

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancelar campanha?"
        footer={<><Button variant="ghost" onClick={() => setConfirmCancel(false)}>Continuar enviando</Button><Button variant="danger" loading={busy === "cancel"} onClick={() => act("cancel")}>Cancelar campanha</Button></>}>
        <p className="text-sm text-ink-300">As mensagens já enviadas continuam no histórico. Os {fmtInt(s.pending)} destinatários pendentes não receberão a mensagem. Esta ação não pode ser desfeita.</p>
      </Modal>
    </>
  );
}
