import { useEffect, useState, type FormEvent } from "react";
import { Save, KeyRound, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useSession } from "../lib/session";
import { Button, Card, PageHeader, ErrorNote, InfoNote, useToast } from "../components/ui";

type Settings = { minDelaySec: number; maxDelaySec: number; dailyLimit: number; batchSize: number; batchPauseSec: number; optOutKeywords: string; optOutFooter: string; timezone: string };

const TZS = ["America/Sao_Paulo", "America/Manaus", "America/Belem", "America/Fortaleza", "America/Recife", "America/Cuiaba", "America/Porto_Velho", "America/Rio_Branco", "America/Noronha", "Europe/Lisbon", "UTC"];

function Num({ label, value, onChange, min, max, hint }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type="number" className="field font-mono" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <p className="mt-1.5 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const { me, refresh } = useSession();
  const toast = useToast();
  const { data } = useApi<{ settings: Settings }>("/settings");
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  useEffect(() => { if (data?.settings) setS(data.settings); }, [data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!s) return;
    setSaving(true); setErr(null);
    try {
      const r = await api<{ settings: Settings }>("/settings", { method: "PUT", body: s });
      setS(r.settings);
      toast("success", "Configurações salvas.");
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  }

  async function changePw(e: FormEvent) {
    e.preventDefault();
    setPwErr(null);
    if (pw.next !== pw.confirm) { setPwErr("A confirmação não confere com a nova senha."); return; }
    setPwBusy(true);
    try {
      await api("/auth/password", { body: { current: pw.current, next: pw.next } });
      setPw({ current: "", next: "", confirm: "" });
      toast("success", "Senha alterada. Outras sessões foram encerradas.");
      void refresh();
    } catch (e: any) { setPwErr(e.message); } finally { setPwBusy(false); }
  }

  return (
    <>
      <PageHeader eyebrow="Conta" title="Configurações" subtitle="Controle de frequência, descadastro e segurança da conta." />
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr] items-start">
        <Card className="p-6 animate-rise">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2"><ShieldCheck className="size-5 text-leaf-400" /> Proteção da conta de WhatsApp</h3>
          <p className="mt-1 text-sm text-ink-400">Envios espaçados e limitados reduzem o risco de restrição do número.</p>
          {!s ? <div className="mt-6 text-sm text-ink-400">Carregando…</div> : (
            <form onSubmit={save} className="mt-6 space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <Num label="Intervalo mínimo (s)" value={s.minDelaySec} min={3} max={600} onChange={(v) => setS({ ...s, minDelaySec: v })} hint="Mínimo permitido: 3 segundos" />
                <Num label="Intervalo máximo (s)" value={s.maxDelaySec} min={3} max={900} onChange={(v) => setS({ ...s, maxDelaySec: v })} hint="Cada envio sorteia um valor entre os dois" />
                <Num label="Pausa longa a cada (mensagens)" value={s.batchSize} min={0} max={1000} onChange={(v) => setS({ ...s, batchSize: v })} hint="0 desativa as pausas por lote" />
                <Num label="Duração da pausa longa (s)" value={s.batchPauseSec} min={0} max={3600} onChange={(v) => setS({ ...s, batchPauseSec: v })} />
                <Num label="Limite diário de envios" value={s.dailyLimit} min={1} max={5000} onChange={(v) => setS({ ...s, dailyLimit: v })} hint="Ao atingir, a campanha continua no dia seguinte" />
                <div>
                  <label className="label">Fuso horário (variáveis de data/hora)</label>
                  <select className="field" value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })}>
                    {TZS.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                  </select>
                </div>
              </div>
              <div className="h-px bg-white/5" />
              <div>
                <label className="label">Palavras de descadastro (separadas por vírgula)</label>
                <input className="field" value={s.optOutKeywords} onChange={(e) => setS({ ...s, optOutKeywords: e.target.value })} />
                <p className="mt-1.5 text-xs text-ink-400">Quando um contato responde exatamente uma dessas palavras, ele é descadastrado e recebe uma confirmação.</p>
              </div>
              <div>
                <label className="label">Texto de descadastro adicionado ao fim das mensagens</label>
                <input className="field" value={s.optOutFooter} onChange={(e) => setS({ ...s, optOutFooter: e.target.value })} />
              </div>
              {err && <ErrorNote>{err}</ErrorNote>}
              <Button type="submit" loading={saving} icon={<Save className="size-4" />}>Salvar configurações</Button>
            </form>
          )}
        </Card>

        <Card className="p-6 animate-rise" style={{ animationDelay: "80ms" }}>
          <h3 className="font-display text-lg font-semibold flex items-center gap-2"><KeyRound className="size-5 text-leaf-400" /> Alterar senha</h3>
          {me?.viewing ? (
            <div className="mt-4"><InfoNote>Para redefinir a senha de outro usuário, use <b>Gerenciar Usuários</b>.</InfoNote></div>
          ) : (
            <form onSubmit={changePw} className="mt-5 space-y-4">
              <div><label className="label">Senha atual</label><input type="password" autoComplete="current-password" className="field" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></div>
              <div><label className="label">Nova senha</label><input type="password" autoComplete="new-password" minLength={8} className="field" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></div>
              <div><label className="label">Confirmar nova senha</label><input type="password" autoComplete="new-password" minLength={8} className="field" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></div>
              {pwErr && <ErrorNote>{pwErr}</ErrorNote>}
              <Button type="submit" variant="soft" loading={pwBusy}>Atualizar senha</Button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
