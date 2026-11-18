import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode, KeyRound, RefreshCw, Unplug, PlugZap, CheckCircle2, Smartphone, Loader2, ShieldAlert } from "lucide-react";
import { api, formatPhone, timeAgo } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useSession } from "../lib/session";
import { Button, Card, PageHeader, ErrorNote, InfoNote, Modal, Avatar, useToast, cx } from "../components/ui";

type Status = {
  status: string; connected: boolean; method: string | null; phone: string | null; pushName: string | null; profilePicUrl: string | null;
  qr: string | null; pairingCode: string | null; pairingExpiresAt: string | null; lastError: string | null;
  syncing: boolean; lastSyncAt: string | null; lastConnectedAt: string | null; live: boolean;
};

function QrImage({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 560, color: { dark: "#0b100d", light: "#ffffff" }, errorCorrectionLevel: "M" }).then(setSrc);
  }, [value]);
  return (
    <div className="rounded-2xl bg-white p-3 shadow-[0_30px_60px_-30px_rgba(47,210,124,0.5)] animate-pop">
      {src ? <img src={src} alt="QR Code para conectar o WhatsApp" className="size-[240px] sm:size-[264px]" /> : <div className="size-[240px] sm:size-[264px]" />}
    </div>
  );
}

function Countdown({ until }: { until: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!until) return null;
  const s = Math.max(0, Math.round((new Date(until).getTime() - now) / 1000));
  return <span className="font-mono">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>;
}

export default function ConnectionPage() {
  const { me, refresh } = useSession();
  const toast = useToast();
  const [method, setMethod] = useState<"qr" | "code">("qr");
  const [phone, setPhone] = useState("55");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const { data: st, reload, setData } = useApi<Status>("/whatsapp/status", { poll: 2500 });
  const viewing = !!me?.viewing;
  const pairing = st && (st.status === "qr" || st.status === "pairing" || st.status === "connecting");

  // Quando a conexão é concluída, atualiza a sessão (menu lateral, redirecionamentos).
  const [wasConnected, setWasConnected] = useState<boolean | null>(null);
  useEffect(() => {
    if (!st) return;
    if (wasConnected === false && st.connected) {
      toast("success", "WhatsApp conectado! Importando contatos e grupos…");
      void refresh();
    }
    setWasConnected(st.connected);
  }, [st?.connected]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(name: string, fn: () => Promise<Status>) {
    setBusy(name);
    setErr(null);
    try {
      const s = await fn();
      setData(s);
      return s;
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  const start = () => run("connect", () => api<Status>("/whatsapp/connect", { body: { method, phone: method === "code" ? phone : undefined } }));

  return (
    <>
      <PageHeader eyebrow="Conexão" title="WhatsApp" subtitle="Conecte o número que será usado nos seus disparos. A sessão fica salva — não é preciso conectar de novo a cada login." />

      {err && <div className="mb-5"><ErrorNote>{err}</ErrorNote></div>}

      {st?.connected ? (
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <Card className="p-7 relative overflow-hidden animate-rise">
            <div className="absolute -right-24 -top-24 size-72 rounded-full bg-leaf-500/10 blur-3xl" />
            <div className="relative flex items-center gap-5">
              <Avatar name={st.pushName ?? st.phone} src={st.profilePicUrl} size={72} />
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full bg-leaf-500/10 border border-leaf-500/25 px-2.5 py-1 text-xs font-semibold text-leaf-300">
                  <CheckCircle2 className="size-3.5" /> Conectado e salvo
                </div>
                <div className="mt-2 font-mono text-2xl sm:text-3xl">{formatPhone(st.phone)}</div>
                {st.pushName && <div className="text-ink-300">{st.pushName}</div>}
              </div>
            </div>
            <dl className="relative mt-7 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div><dt className="text-ink-400 text-xs">Conectado desde</dt><dd className="mt-1">{timeAgo(st.lastConnectedAt)}</dd></div>
              <div><dt className="text-ink-400 text-xs">Última sincronização</dt><dd className="mt-1 flex items-center gap-1.5">{st.syncing ? <><Loader2 className="size-3.5 animate-spin text-leaf-400" /> sincronizando…</> : timeAgo(st.lastSyncAt)}</dd></div>
              <div><dt className="text-ink-400 text-xs">Socket</dt><dd className="mt-1">{st.live ? "ativo agora" : "sob demanda"}</dd></div>
            </dl>
            <div className="relative mt-7 flex flex-wrap gap-2">
              <Button icon={<RefreshCw className="size-4" />} loading={busy === "sync"} disabled={st.syncing}
                onClick={() => run("sync", () => api<Status>("/whatsapp/sync", { method: "POST" })).then((s) => s && toast("info", "Sincronização iniciada. Contatos e grupos aparecem em instantes."))}>
                Sincronizar contatos e grupos
              </Button>
              <Button variant="outline" icon={<PlugZap className="size-4" />} loading={busy === "reconnect"}
                onClick={() => run("reconnect", () => api<Status>("/whatsapp/reconnect", { method: "POST" })).then((s) => s && toast("success", "Conexão verificada com sucesso."))}>
                Testar conexão
              </Button>
              <Button variant="danger" icon={<Unplug className="size-4" />} onClick={() => setConfirmOff(true)}>Desconectar</Button>
            </div>
          </Card>
          <Card className="p-7 animate-rise" style={{ animationDelay: "80ms" }}>
            <h3 className="font-display text-lg font-semibold">Como a conexão funciona</h3>
            <ul className="mt-4 space-y-3 text-sm text-ink-300 leading-relaxed">
              <li>• A sessão é guardada criptografada (AES-256-GCM). Nem administradores têm acesso às credenciais.</li>
              <li>• O servidor abre a conexão apenas quando precisa: ao enviar campanhas, sincronizar ou testar. Isso reduz o consumo e o risco de bloqueio.</li>
              <li>• Se você remover o dispositivo em <i>Aparelhos conectados</i> no celular, a sessão é encerrada e será preciso conectar de novo.</li>
              <li>• Respostas com palavras como <b>SAIR</b> descadastram o contato automaticamente quando recebidas durante uma conexão ativa.</li>
            </ul>
          </Card>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          <Card className="p-6 sm:p-7 animate-rise">
            {viewing ? (
              <InfoNote>O pareamento só pode ser feito pelo próprio usuário, para proteger as credenciais do WhatsApp dele.</InfoNote>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-ink-900 border border-white/5">
                  {([["qr", "QR Code", QrCode], ["code", "Código de pareamento", KeyRound]] as const).map(([k, label, Icon]) => (
                    <button key={k} disabled={!!pairing} onClick={() => setMethod(k)}
                      className={cx("flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all disabled:opacity-60",
                        method === k ? "bg-ink-750 text-ink-100 shadow" : "text-ink-400 hover:text-ink-200")}>
                      <Icon className="size-4" /> {label}
                    </button>
                  ))}
                </div>

                {method === "qr" ? (
                  <ol className="mt-6 space-y-3.5 text-sm text-ink-300">
                    {["Abra o WhatsApp no celular.", "Toque em Mais opções (⋮) ou Configurações e vá em Aparelhos conectados.", "Toque em Conectar um aparelho e aponte a câmera para o QR Code."].map((t, i) => (
                      <li key={i} className="flex gap-3"><span className="grid place-items-center size-6 shrink-0 rounded-full bg-leaf-500/12 text-leaf-300 text-xs font-bold">{i + 1}</span>{t}</li>
                    ))}
                  </ol>
                ) : (
                  <div className="mt-6 space-y-4">
                    <div>
                      <label className="label" htmlFor="ph">Número do WhatsApp com DDI e DDD</label>
                      <input id="ph" className="field font-mono" inputMode="numeric" value={phone} disabled={!!pairing}
                        onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ""))} placeholder="5511987654321" />
                      <p className="mt-1.5 text-xs text-ink-400">Exemplo: 55 (Brasil) + 11 (DDD) + 987654321 → <span className="font-mono">5511987654321</span></p>
                    </div>
                    <ol className="space-y-3 text-sm text-ink-300">
                      {["Gere o código abaixo.", "No celular: Aparelhos conectados → Conectar um aparelho → Conectar com número de telefone.", "Digite o código de 8 caracteres exibido aqui."].map((t, i) => (
                        <li key={i} className="flex gap-3"><span className="grid place-items-center size-6 shrink-0 rounded-full bg-leaf-500/12 text-leaf-300 text-xs font-bold">{i + 1}</span>{t}</li>
                      ))}
                    </ol>
                  </div>
                )}

                <div className="mt-7 flex flex-wrap gap-2">
                  {!pairing ? (
                    <Button size="lg" loading={busy === "connect"} onClick={start} icon={method === "qr" ? <QrCode className="size-5" /> : <KeyRound className="size-5" />}>
                      {method === "qr" ? "Gerar QR Code" : "Gerar código de pareamento"}
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" loading={busy === "connect"} onClick={start} icon={<RefreshCw className="size-4" />}>Gerar novamente</Button>
                      <Button variant="ghost" loading={busy === "cancel"} onClick={() => run("cancel", () => api<Status>("/whatsapp/cancel", { method: "POST" }))}>Cancelar</Button>
                    </>
                  )}
                </div>
              </>
            )}
            {st?.lastError && !pairing && <div className="mt-5"><InfoNote tone="amber">{st.lastError}</InfoNote></div>}
          </Card>

          <Card className="p-6 sm:p-8 min-h-[380px] grid place-items-center animate-rise wa-wall" style={{ animationDelay: "80ms" }}>
            {st?.qr ? (
              <div className="flex flex-col items-center text-center">
                <QrImage value={st.qr} />
                <p className="mt-5 text-sm text-ink-300 flex items-center gap-2"><Loader2 className="size-4 animate-spin text-leaf-400" /> Aguardando leitura… o código se renova automaticamente</p>
              </div>
            ) : st?.pairingCode ? (
              <div className="flex flex-col items-center text-center animate-pop">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">Seu código</div>
                <div className="mt-4 flex gap-1.5 sm:gap-2">
                  {st.pairingCode.split("").map((ch, i) => (
                    <span key={i} className={cx("grid place-items-center w-9 h-12 sm:w-11 sm:h-14 rounded-xl bg-ink-850 border border-leaf-500/25 font-mono text-2xl sm:text-3xl text-leaf-300", i === 3 && "mr-2 sm:mr-3")}>{ch}</span>
                  ))}
                </div>
                <p className="mt-5 text-sm text-ink-300">Digite no celular · expira em <Countdown until={st.pairingExpiresAt} /></p>
                <p className="mt-1 text-xs text-ink-400 flex items-center gap-2"><Loader2 className="size-3.5 animate-spin text-leaf-400" /> Aguardando confirmação</p>
              </div>
            ) : pairing ? (
              <div className="flex flex-col items-center text-ink-300"><Loader2 className="size-8 animate-spin text-leaf-400" /><p className="mt-3 text-sm">Abrindo conexão segura com o WhatsApp…</p></div>
            ) : (
              <div className="flex flex-col items-center text-center max-w-xs">
                <div className="grid place-items-center size-20 rounded-3xl bg-leaf-500/8 border border-leaf-500/15 text-leaf-400"><Smartphone className="size-9" /></div>
                <p className="mt-5 font-display text-lg font-semibold">Nenhum número conectado</p>
                <p className="mt-1.5 text-sm text-ink-300">Escolha QR Code ou código de pareamento e siga os passos.</p>
              </div>
            )}
          </Card>

          <div className="lg:col-span-2">
            <InfoNote>
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink-200"><ShieldAlert className="size-4" /> Sobre a integração:</span>{" "}
              a conexão usa o protocolo de multidispositivos do WhatsApp Web (o mesmo de “Aparelhos conectados”). Ela não é a API oficial do WhatsApp Business
              e o WhatsApp pode desconectar ou restringir números que enviam mensagens em massa para quem não as autorizou. Use intervalos generosos, envie apenas a quem consentiu e mantenha o descadastro ativo.
            </InfoNote>
          </div>
        </div>
      )}

      <Modal open={confirmOff} onClose={() => setConfirmOff(false)} title="Desconectar este número?"
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmOff(false)}>Manter conectado</Button>
          <Button variant="danger" loading={busy === "off"} onClick={async () => {
            await run("off", () => api<Status>("/whatsapp/disconnect", { method: "POST" }));
            setConfirmOff(false);
            void refresh();
            void reload(true);
          }}>Desconectar</Button>
        </>}>
        <p className="text-sm text-ink-300 leading-relaxed">A sessão salva será apagada e o aparelho removido da lista de “Aparelhos conectados”. Campanhas em andamento serão pausadas até uma nova conexão. Seus contatos e histórico continuam salvos.</p>
      </Modal>
    </>
  );
}
