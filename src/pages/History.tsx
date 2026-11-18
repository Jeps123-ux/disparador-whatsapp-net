import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { History, Search, Send, Image as ImageIcon, FileText, Film } from "lucide-react";
import { fmtDate, fmtInt } from "../lib/api";
import { useApi } from "../lib/useApi";
import { Button, Card, PageHeader, StatusBadge, Empty, Skeleton, ErrorNote, cx } from "../components/ui";

type Row = {
  id: number; name: string; message: string; status: string; createdAt: string; finishedAt: string | null; mediaType: string | null; mediaName: string | null; lastError: string | null;
  stats: { total: number; sent: number; delivered: number; failed: number; skipped: number; pending: number; progress: number };
};

const FILTERS = [["all", "Todas"], ["running", "Em andamento"], ["paused", "Pausadas"], ["completed", "Concluídas"], ["cancelled", "Canceladas"]] as const;

export default function HistoryPage() {
  const { data, loading, error } = useApi<{ campaigns: Row[] }>("/campaigns", { poll: 8000 });
  const [q, setQ] = useState("");
  const [f, setF] = useState<string>("all");
  const list = useMemo(() => (data?.campaigns ?? []).filter((c) =>
    (f === "all" || c.status === f) && (!q.trim() || `${c.name} ${c.message}`.toLowerCase().includes(q.toLowerCase()))), [data, q, f]);

  return (
    <>
      <PageHeader eyebrow="Campanhas" title="Histórico" subtitle="Todas as campanhas realizadas, com o resultado de cada envio."
        actions={<Link to="/disparo"><Button icon={<Send className="size-4" />}>Novo disparo</Button></Link>} />
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="mb-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => setF(k)} className={cx("rounded-full px-3.5 py-1.5 text-[13px] font-semibold border transition-all", f === k ? "bg-leaf-500/12 border-leaf-500/30 text-leaf-300" : "border-white/8 text-ink-300 hover:text-ink-100")}>{l}</button>
          ))}
        </div>
        <div className="relative md:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-ink-400" />
          <input className="field !pl-10" placeholder="Buscar campanha" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : list.length === 0 ? (
        <Card><Empty icon={<History className="size-6" />} title={data?.campaigns.length ? "Nenhuma campanha com esse filtro" : "Nenhuma campanha ainda"} action={<Link to="/disparo"><Button>Criar o primeiro disparo</Button></Link>}>
          As campanhas aparecem aqui assim que você inicia um disparo.
        </Empty></Card>
      ) : (
        <div className="space-y-3">
          {list.map((c, i) => (
            <Link key={c.id} to={`/historico/${c.id}`} className="block animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
              <Card className="p-5 hover:!border-leaf-500/20 transition-all hover:-translate-y-px">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="font-semibold text-[15.5px] truncate">{c.name}</h3>
                      <StatusBadge status={c.status} />
                      {c.mediaType && <span className="inline-flex items-center gap-1 text-xs text-ink-400">{c.mediaType === "image" ? <ImageIcon className="size-3.5" /> : c.mediaType === "video" ? <Film className="size-3.5" /> : <FileText className="size-3.5" />}{c.mediaName}</span>}
                    </div>
                    <p className="mt-1.5 text-sm text-ink-300 line-clamp-1">{c.message || "(somente arquivo)"}</p>
                    <p className="mt-1.5 text-xs text-ink-400">{fmtDate(c.createdAt)}{c.finishedAt ? ` → ${fmtDate(c.finishedAt)}` : ""}</p>
                  </div>
                  <div className="grid grid-cols-4 gap-4 lg:w-[420px] text-center">
                    {[["Destinatários", c.stats.total], ["Enviadas", c.stats.sent], ["Falhas", c.stats.failed], ["Pendentes", c.stats.pending]].map(([l, v]) => (
                      <div key={l as string}><div className="font-mono text-lg">{fmtInt(v as number)}</div><div className="text-[11px] text-ink-400">{l}</div></div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 h-1.5 rounded-full bg-ink-700 overflow-hidden">
                  <div className={cx("h-full rounded-full transition-all duration-700", c.status === "running" ? "bg-leaf-500 progress-stripes" : c.status === "cancelled" ? "bg-ink-500" : "bg-leaf-600")} style={{ width: `${c.stats.progress}%` }} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
