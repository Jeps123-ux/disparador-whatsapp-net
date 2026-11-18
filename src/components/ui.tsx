import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X, Loader2, CheckCircle2, AlertTriangle, Info } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger" | "soft";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }: BtnProps) {
  const base = "relative inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 select-none disabled:opacity-45 disabled:pointer-events-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-leaf-500/25";
  const sizes = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm", lg: "h-14 px-7 text-base" }[size];
  const variants = {
    primary: "bg-leaf-500 text-ink-950 hover:bg-leaf-400 shadow-[0_8px_24px_-10px_rgba(47,210,124,0.65)] hover:shadow-[0_10px_30px_-10px_rgba(47,210,124,0.8)] hover:-translate-y-px",
    soft: "bg-leaf-500/10 text-leaf-300 hover:bg-leaf-500/18 border border-leaf-500/20",
    ghost: "text-ink-200 hover:bg-white/5 hover:text-ink-100",
    outline: "border border-white/10 text-ink-100 hover:border-white/20 hover:bg-white/[0.03]",
    danger: "bg-rose-soft/12 text-rose-soft border border-rose-soft/25 hover:bg-rose-soft/20",
  }[variant];
  return (
    <button className={cx(base, sizes, variants, className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("card", className)} {...rest}>{children}</div>;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  running: { label: "Em andamento", cls: "bg-leaf-500/12 text-leaf-300 border-leaf-500/25" },
  paused: { label: "Pausada", cls: "bg-amber-soft/10 text-amber-soft border-amber-soft/25" },
  completed: { label: "Concluída", cls: "bg-white/5 text-ink-200 border-white/10" },
  cancelled: { label: "Cancelada", cls: "bg-rose-soft/10 text-rose-soft border-rose-soft/25" },
  failed: { label: "Falhou", cls: "bg-rose-soft/10 text-rose-soft border-rose-soft/25" },
  pending: { label: "Pendente", cls: "bg-white/5 text-ink-300 border-white/10" },
  sending: { label: "Enviando", cls: "bg-leaf-500/12 text-leaf-300 border-leaf-500/25" },
  sent: { label: "Enviada", cls: "bg-leaf-500/10 text-leaf-300 border-leaf-500/20" },
  delivered: { label: "Entregue", cls: "bg-leaf-500/15 text-leaf-300 border-leaf-500/30" },
  read: { label: "Lida", cls: "bg-sky-400/10 text-sky-300 border-sky-400/25" },
  skipped: { label: "Ignorada", cls: "bg-white/5 text-ink-300 border-white/10" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-white/5 text-ink-300 border-white/10" };
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", s.cls)}>
      {status === "running" && <span className="size-1.5 rounded-full bg-leaf-400 live-dot" />}
      {s.label}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "rose" }) {
  const cls = {
    neutral: "bg-white/5 text-ink-300 border-white/10",
    green: "bg-leaf-500/10 text-leaf-300 border-leaf-500/25",
    amber: "bg-amber-soft/10 text-amber-soft border-amber-soft/25",
    rose: "bg-rose-soft/10 text-rose-soft border-rose-soft/25",
  }[tone];
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", cls)}>{children}</span>;
}

export function Avatar({ name, src, size = 36, group }: { name?: string | null; src?: string | null; size?: number; group?: boolean }) {
  const [failed, setFailed] = useState(false);
  const initials = (name ?? "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
  const hue = [...(name ?? "")].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 5;
  const tones = ["bg-leaf-900 text-leaf-300", "bg-ink-700 text-ink-200", "bg-[#1d3a30] text-[#8fe0b8]", "bg-[#28322c] text-ink-200", "bg-[#173326] text-leaf-400"];
  if (src && !failed) {
    return <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} className={cx("shrink-0 object-cover", group ? "rounded-xl" : "rounded-full")} style={{ width: size, height: size }} />;
  }
  return (
    <div className={cx("shrink-0 grid place-items-center font-semibold", group ? "rounded-xl" : "rounded-full", tones[hue])} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-ink-950/75 backdrop-blur-sm animate-fade" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={cx("card relative w-full max-h-[92dvh] flex flex-col animate-pop rounded-b-none sm:rounded-b-[1.25rem] !bg-ink-850", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-4 border-b border-white/5">
          <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-1.5 -mr-1.5 rounded-lg text-ink-300 hover:text-ink-100 hover:bg-white/5" aria-label="Fechar"><X className="size-5" /></button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-white/5 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx("inline-flex items-center gap-3 cursor-pointer select-none", disabled && "opacity-50 pointer-events-none")}>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx("relative h-6 w-11 rounded-full transition-colors", checked ? "bg-leaf-500" : "bg-ink-600")}>
        <span className={cx("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform", checked && "translate-x-5")} />
      </button>
      {label && <span className="text-sm text-ink-200">{label}</span>}
    </label>
  );
}

export function Checkbox({ checked, onChange, disabled, indeterminate }: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; indeterminate?: boolean }) {
  return (
    <span
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onChange?.(!checked); }}
      className={cx(
        "grid place-items-center size-[18px] shrink-0 rounded-md border transition-all",
        checked || indeterminate ? "bg-leaf-500 border-leaf-500 text-ink-950" : "border-ink-500 bg-ink-900",
        disabled ? "opacity-40" : "cursor-pointer hover:border-leaf-500/70",
      )}
    >
      {checked && <svg viewBox="0 0 12 12" className="size-3"><path d="M2.5 6.2 5 8.6l4.6-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      {!checked && indeterminate && <span className="h-0.5 w-2 rounded bg-ink-950" />}
    </span>
  );
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12">
      <div className="grid place-items-center size-14 rounded-2xl bg-leaf-500/8 border border-leaf-500/15 text-leaf-400 mb-4">{icon}</div>
      <h4 className="font-display text-base font-semibold">{title}</h4>
      {children && <p className="mt-1.5 max-w-sm text-sm text-ink-300 leading-relaxed">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-7 animate-rise">
      <div>
        {eyebrow && <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-leaf-400 mb-2">{eyebrow}</div>}
        <h1 className="font-display text-[28px] sm:text-[32px] font-semibold tracking-tight leading-none">{title}</h1>
        {subtitle && <p className="mt-2.5 text-ink-300 text-[15px] max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-rose-soft/25 bg-rose-soft/8 px-3.5 py-2.5 text-sm text-rose-soft">
      <AlertTriangle className="size-4 mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function InfoNote({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "amber" }) {
  return (
    <div className={cx("flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm",
      tone === "amber" ? "border-amber-soft/25 bg-amber-soft/8 text-amber-soft" : "border-white/8 bg-white/[0.02] text-ink-300")}>
      <Info className="size-4 mt-0.5 shrink-0" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

/* ---------------- Toasts ---------------- */
type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed z-[60] bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 items-stretch sm:items-end pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto animate-pop card !rounded-xl px-4 py-3 flex items-center gap-3 text-sm sm:max-w-sm !bg-ink-800">
            {t.kind === "success" ? <CheckCircle2 className="size-4 text-leaf-400 shrink-0" /> : t.kind === "error" ? <AlertTriangle className="size-4 text-rose-soft shrink-0" /> : <Info className="size-4 text-ink-300 shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
