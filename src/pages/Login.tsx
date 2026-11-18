import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Lock, User, ArrowRight, QrCode, Layers, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { Button, ErrorNote } from "../components/ui";
import { Logo } from "../components/Layout";

export default function LoginPage() {
  const { me, refresh, loading } = useSession();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && me) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { body: { username, password } });
      const data = await refresh();
      if (data && !data.whatsapp.connected) nav("/conexao", { replace: true });
      else nav(loc.state?.from && loc.state.from !== "/login" ? loc.state.from : "/", { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-white/5 p-12">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <svg className="absolute -left-40 top-1/2 -translate-y-1/2 w-[900px] opacity-[0.5]" viewBox="0 0 800 800">
            {[...Array(9)].map((_, i) => (
              <circle key={i} cx="400" cy="400" r={70 + i * 42} fill="none" stroke="#2fd27c" strokeOpacity={0.22 - i * 0.022} strokeWidth="1.2" />
            ))}
            <circle cx="400" cy="400" r="22" fill="#2fd27c" fillOpacity=".85" />
          </svg>
        </div>
        <Logo />
        <div className="relative max-w-lg animate-rise">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-leaf-400 mb-5">Gestão de disparos no WhatsApp</p>
          <h1 className="font-display text-5xl xl:text-6xl font-semibold leading-[1.02] tracking-tight">
            Uma mensagem bem escrita.<br /><span className="text-leaf-400">Centenas de conversas.</span>
          </h1>
          <p className="mt-6 text-ink-300 text-lg leading-relaxed max-w-md">
            Cada pessoa da equipe com o próprio número conectado, campanhas personalizadas e um administrador acompanhando tudo.
          </p>
        </div>
        <ul className="relative grid grid-cols-3 gap-4 text-sm text-ink-300 max-w-xl">
          <li className="flex items-start gap-2.5"><QrCode className="size-4 mt-0.5 text-leaf-400 shrink-0" />QR Code ou código de pareamento</li>
          <li className="flex items-start gap-2.5"><Layers className="size-4 mt-0.5 text-leaf-400 shrink-0" />Fila com intervalos e limites</li>
          <li className="flex items-start gap-2.5"><ShieldCheck className="size-4 mt-0.5 text-leaf-400 shrink-0" />Dados isolados por usuário</li>
        </ul>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <form onSubmit={submit} className="w-full max-w-sm animate-rise">
          <div className="lg:hidden mb-10"><Logo /></div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">Entrar</h2>
          <p className="mt-2 text-ink-300">Use o usuário e a senha fornecidos pelo administrador.</p>
          <div className="mt-8 space-y-4">
            <div>
              <label className="label" htmlFor="u">Usuário</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-ink-400" />
                <input id="u" className="field !pl-10" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="seu.usuario" required />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="p">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-ink-400" />
                <input id="p" type="password" className="field !pl-10" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Acessar painel <ArrowRight className="size-4" />
            </Button>
          </div>
          <p className="mt-8 text-xs text-ink-400 leading-relaxed">
            Seu WhatsApp fica salvo com segurança depois da primeira conexão — nos próximos acessos basta entrar com usuário e senha.
          </p>
        </form>
      </section>
    </div>
  );
}
