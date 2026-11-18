import { useMemo, useState } from "react";
import { fmtInt } from "../lib/api";

type Point = { day: string; sent: number; failed: number };

/** Barras verticais de mensagens enviadas por dia (série única) com tooltip por barra. */
export function DailyChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => Math.max(5, ...data.map((d) => d.sent)), [data]);
  const nice = useMemo(() => {
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => max / s <= 4) ?? p * 10;
    return { top: Math.ceil(max / step) * step, step };
  }, [max]);
  const W = 640, H = 220, padL = 34, padB = 26, padT = 12;
  const innerW = W - padL - 8, innerH = H - padB - padT;
  const bw = innerW / data.length;
  const y = (v: number) => padT + innerH - (v / nice.top) * innerH;
  const ticks: number[] = [];
  for (let v = 0; v <= nice.top; v += nice.step) ticks.push(v);
  const dayLabel = (d: string) => { const [, m, dd] = d.split("-"); return `${dd}/${m}`; };
  const weekday = (d: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Mensagens enviadas por dia nos últimos 14 dias">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#383835" : "#1f2924"} strokeWidth="1" />
            <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#66776e" fontFamily="JetBrains Mono">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * bw;
          const h = Math.max(0, y(0) - y(d.sent));
          const barW = Math.max(4, bw - 8);
          const bx = x + (bw - barW) / 2;
          const active = hover === i;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x} y={padT} width={bw} height={innerH + padB} fill="transparent" />
              {active && <rect x={x + 2} y={padT} width={bw - 4} height={innerH} rx="6" fill="rgba(255,255,255,0.03)" />}
              {d.sent > 0 && (
                <path
                  d={`M${bx},${y(0)} v${-Math.max(0, h - 4)} q0,-4 4,-4 h${barW - 8} q4,0 4,4 v${Math.max(0, h - 4)} z`}
                  fill={active ? "#4fdc8d" : "#2fd27c"}
                  opacity={hover === null || active ? 1 : 0.55}
                  style={{ transition: "opacity .15s, fill .15s" }}
                />
              )}
              {(i % 2 === 0 || data.length <= 7) && (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#66776e" fontFamily="JetBrains Mono">{dayLabel(d.day)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-xl border border-white/10 bg-ink-800/95 backdrop-blur px-3 py-2 text-xs shadow-xl"
          style={{ left: `${((padL + hover * bw + bw / 2) / W) * 100}%`, top: `${(y(data[hover].sent) / H) * 100}%`, marginTop: -8 }}
        >
          <div className="text-ink-300 capitalize">{weekday(data[hover].day)} · {dayLabel(data[hover].day)}</div>
          <div className="mt-1 flex items-center gap-2"><span className="size-2 rounded-sm bg-leaf-500" /><b className="font-mono">{fmtInt(data[hover].sent)}</b> enviadas</div>
          <div className="text-ink-300">{fmtInt(data[hover].failed)} com falha</div>
        </div>
      )}
      <table className="sr-only">
        <caption>Mensagens por dia</caption>
        <thead><tr><th>Dia</th><th>Enviadas</th><th>Falhas</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.sent}</td><td>{d.failed}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/** Barra única de composição: entregues / só enviadas / falhas / pendentes. */
export function DeliveryBar({ delivered, sent, failed, pending }: { delivered: number; sent: number; failed: number; pending: number }) {
  const onlySent = Math.max(0, sent - delivered);
  const total = delivered + onlySent + failed + pending;
  const parts = [
    { key: "Entregues", v: delivered, color: "#2fd27c" },
    { key: "Enviadas (sem confirmação)", v: onlySent, color: "#17834c" },
    { key: "Falhas", v: failed, color: "#d03b3b" },
    { key: "Pendentes", v: pending, color: "#3c4c44" },
  ];
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-ink-800">
        {total > 0 && parts.filter((p) => p.v > 0).map((p) => (
          <div key={p.key} title={`${p.key}: ${fmtInt(p.v)}`} style={{ width: `${(p.v / total) * 100}%`, background: p.color }} className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-500" />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2 text-ink-300">
            <span className="size-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
            <span className="truncate">{p.key}</span>
            <span className="ml-auto font-mono text-ink-100">{fmtInt(p.v)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
