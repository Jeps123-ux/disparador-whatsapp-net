import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Send, Users, UsersRound, History, Smartphone, Settings, ShieldCheck, Activity, LogOut, Menu, X, Eye,
} from "lucide-react";
import { useSession } from "../lib/session";
import { formatPhone } from "../lib/api";
import { cx } from "./ui";

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="size-8 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="16" fill="#122019" />
        <path d="M20 36c0-7.7 5.4-13 12-13s12 5.3 12 13" fill="none" stroke="#2fd27c" strokeWidth="5" strokeLinecap="round" />
        <path d="M14 44c0-11 8-19 18-19s18 8 18 19" fill="none" stroke="#2fd27c" strokeOpacity=".45" strokeWidth="4" strokeLinecap="round" />
        <circle cx="32" cy="38" r="5" fill="#2fd27c" />
      </svg>
      {!compact && <span className="font-display text-xl font-semibold tracking-tight">ecoa</span>}
    </div>
  );
}

const NAV = [
  { to: "/", label: "Painel", icon: LayoutDashboard, end: true },
  { to: "/disparo", label: "Criar Disparo", icon: Send },
  { to: "/contatos", label: "Contatos", icon: Users },
  { to: "/grupos", label: "Grupos", icon: UsersRound },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/conexao", label: "Conexão WhatsApp", icon: Smartphone },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];
const ADMIN_NAV = [
  { to: "/admin/usuarios", label: "Gerenciar Usuários", icon: ShieldCheck },
  { to: "/admin/monitoramento", label: "Monitoramento", icon: Activity },
];

function NavItem({ to, label, icon: Icon, end, onClick }: { to: string; label: string; icon: any; end?: boolean; onClick?: () => void }) {
  return (
    <NavLink to={to} end={end} onClick={onClick}
      className={({ isActive }) => cx(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-all",
        isActive ? "bg-leaf-500/10 text-leaf-300" : "text-ink-300 hover:text-ink-100 hover:bg-white/[0.04]",
      )}>
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-leaf-500" />}
          <Icon className={cx("size-[18px] transition-transform group-hover:scale-110", isActive ? "text-leaf-400" : "")} />
          {label}
        </>
      )}
    </NavLink>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { me, logout, viewAs } = useSession();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);
  if (!me) return null;
  const isAdmin = me.user.role === "admin";
  const wa = me.whatsapp;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-6 pb-5 flex items-center justify-between">
        <Logo />
        <button className="lg:hidden p-1.5 rounded-lg text-ink-300 hover:bg-white/5" onClick={() => setOpen(false)} aria-label="Fechar menu"><X className="size-5" /></button>
      </div>

      <NavLink to="/conexao" className="mx-3 mb-4 rounded-2xl border border-white/6 bg-white/[0.02] px-3.5 py-3 hover:border-leaf-500/25 transition-colors">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
          <span className={cx("size-2 rounded-full", wa.connected ? "bg-leaf-500 live-dot" : "bg-rose-soft")} />
          {wa.connected ? "Conectado" : "Desconectado"}
        </div>
        <div className="mt-1 font-mono text-[13px] text-ink-100 truncate">{wa.phone ? formatPhone(wa.phone) : "Nenhum número"}</div>
      </NavLink>

      <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
        {NAV.map((n) => <NavItem key={n.to} {...n} />)}
        {isAdmin && (
          <>
            <div className="px-3 pt-6 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">Administração</div>
            {ADMIN_NAV.map((n) => <NavItem key={n.to} {...n} />)}
          </>
        )}
      </nav>

      <div className="p-3 border-t border-white/5">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="grid place-items-center size-9 rounded-full bg-leaf-900 text-leaf-300 font-semibold text-sm">{(me.user.name || me.user.username)[0]?.toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">{me.user.name || me.user.username}</div>
            <div className="text-[11.5px] text-ink-400">{isAdmin ? "Administrador" : "Usuário"} · @{me.user.username}</div>
          </div>
          <button onClick={async () => { await logout(); nav("/login"); }} className="p-2 rounded-lg text-ink-400 hover:text-rose-soft hover:bg-rose-soft/10 transition-colors" title="Sair" aria-label="Sair">
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh">
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-[264px] border-r border-white/5 bg-ink-900/80 backdrop-blur-xl z-30">{sidebar}</aside>
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm animate-fade" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-ink-900 border-r border-white/5 animate-rise">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-[264px]">
        <header className="lg:hidden sticky top-0 z-20 flex items-center justify-between px-4 h-14 border-b border-white/5 bg-ink-900/85 backdrop-blur-xl">
          <button onClick={() => setOpen(true)} className="p-2 -ml-2 rounded-lg text-ink-200 hover:bg-white/5" aria-label="Abrir menu"><Menu className="size-5" /></button>
          <Logo />
          <span className={cx("size-2.5 rounded-full", wa.connected ? "bg-leaf-500" : "bg-rose-soft")} />
        </header>
        {me.viewing && (
          <div className="sticky top-14 lg:top-0 z-20 flex flex-wrap items-center justify-between gap-2 px-4 sm:px-8 py-2.5 bg-amber-soft/10 border-b border-amber-soft/20 text-amber-soft text-sm backdrop-blur-xl">
            <span className="flex items-center gap-2"><Eye className="size-4" /> Você está acessando o painel de <b>{me.viewing.name || me.viewing.username}</b> (@{me.viewing.username})</span>
            <button className="font-semibold underline underline-offset-4 hover:text-white" onClick={async () => { await viewAs(null); nav("/admin/monitoramento"); }}>Voltar ao meu painel</button>
          </div>
        )}
        <main className="px-4 sm:px-8 py-7 sm:py-9 max-w-[1400px] mx-auto">{children}</main>
      </div>
    </div>
  );
}
