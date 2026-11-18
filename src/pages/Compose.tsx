import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Braces, Smile, Paperclip, X, Rocket, Users, UsersRound, Megaphone, Timer, FileText, Image as ImageIcon, Film, Lock, RefreshCw,
} from "lucide-react";
import { api, fmtInt, formatPhone } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useSession } from "../lib/session";
import { TEMPLATE_VARIABLES, composeMessage } from "../../shared/template";
import { Button, Card, PageHeader, Modal, Toggle, ErrorNote, InfoNote, Avatar, Badge, Checkbox, useToast, cx } from "../components/ui";
import { SelectableList, contactName, type Contact, type Group } from "../components/SelectableList";
import { WaPreview } from "../components/WaPreview";

const EMOJIS = "😀 😃 😊 😉 😍 🥰 😎 🤩 🙏 👏 👍 👋 🤝 💪 🎉 🎊 🎁 🔥 ✨ ⭐ ✅ ✔️ ❌ ⚠️ 📢 📣 📅 ⏰ 🕒 📍 📞 📲 💬 💡 💰 💳 🛒 🏷️ 🚀 ❤️ 💚 💙 🤍 👉 👇 ☀️ 🌙 🍀 🎯".split(" ");

type Media = { key: string; type: "image" | "video" | "document"; name: string; mime: string; size: number };
type Settings = { minDelaySec: number; maxDelaySec: number; dailyLimit: number; batchSize: number; batchPauseSec: number; optOutFooter: string; timezone: string };

function Popover({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener("mousedown", h), 0);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);
  if (!open) return null;
  return <div ref={ref} className="absolute z-30 top-full mt-2 left-0 card !bg-ink-800 !rounded-2xl p-2 animate-pop min-w-[240px]">{children}</div>;
}

export default function ComposePage() {
  const { me } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const contactsQ = useApi<{ contacts: Contact[] }>("/contacts");
  const groupsQ = useApi<{ groups: Group[] }>("/groups");
  const settingsQ = useApi<{ settings: Settings }>("/settings");
  const settings = settingsQ.data?.settings;

  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [media, setMedia] = useState<Media | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fallbackName, setFallbackName] = useState("");
  const [appendOptOut, setAppendOptOut] = useState(true);
  const [minDelay, setMinDelay] = useState<number | null>(null);
  const [maxDelay, setMaxDelay] = useState<number | null>(null);
  const [tab, setTab] = useState<"contacts" | "groups">("contacts");
  const [selC, setSelC] = useState<Set<number>>(new Set());
  const [selG, setSelG] = useState<Set<number>>(new Set());
  const [showVars, setShowVars] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings && minDelay === null) { setMinDelay(settings.minDelaySec); setMaxDelay(settings.maxDelaySec); }
  }, [settings, minDelay]);

  const contacts = useMemo(() => (contactsQ.data?.contacts ?? []).filter((c) => !c.optedOut), [contactsQ.data]);
  const optedOutCount = (contactsQ.data?.contacts.length ?? 0) - contacts.length;
  const groups = groupsQ.data?.groups ?? [];
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const firstContact = useMemo(() => { for (const id of selC) { const c = contactById.get(id); if (c) return c; } return null; }, [selC, contactById]);
  const firstGroup = useMemo(() => { for (const id of selG) { const g = groupById.get(id); if (g) return g; } return null; }, [selG, groupById]);
  const previewTarget = firstContact ? { name: firstContact.name ?? firstContact.notify, phone: firstContact.phone, label: contactName(firstContact), kind: "contact" as const }
    : firstGroup ? { name: firstGroup.subject, phone: null, label: firstGroup.subject, kind: "group" as const } : null;
  const previewText = previewTarget
    ? composeMessage(message, previewTarget, { timeZone: settings?.timezone, fallbackName, footer: previewTarget.kind === "contact" && appendOptOut ? settings?.optOutFooter : null })
    : message + (appendOptOut && settings?.optOutFooter ? `\n\n_${settings.optOutFooter}_` : "");

  const insert = (text: string) => {
    const ta = taRef.current;
    if (!ta) { setMessage((m) => m + text); return; }
    const s = ta.selectionStart ?? message.length, e = ta.selectionEnd ?? message.length;
    const next = message.slice(0, s) + text + message.slice(e);
    setMessage(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + text.length, s + text.length); });
  };
  const wrap = (mark: string) => {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = message.slice(s, e) || "texto";
    setMessage(message.slice(0, s) + mark + sel + mark + message.slice(e));
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + 1, s + 1 + sel.length); });
  };

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { toast("error", "O arquivo precisa ter no máximo 15 MB."); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const r = await api<{ media: Media }>("/campaigns/media", { form, method: "POST" });
      setMedia(r.media);
      setMediaPreview(r.media.type === "image" ? URL.createObjectURL(f) : null);
    } catch (e: any) {
      toast("error", e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const totalSel = selC.size + selG.size;
  const canStart = !!me?.whatsapp.connected && totalSel > 0 && (message.trim() || media) && name.trim() && !uploading;
  const avgDelay = ((minDelay ?? 8) + (maxDelay ?? 20)) / 2;
  const batchExtra = settings && settings.batchSize > 0 ? Math.floor(totalSel / settings.batchSize) * settings.batchPauseSec : 0;
  const etaMin = Math.ceil((totalSel * avgDelay + batchExtra) / 60);

  function openConfirm() {
    setErr(null);
    if (!name.trim()) setName(`Campanha ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}`);
    setConsent(false);
    setConfirm(true);
  }

  async function start() {
    setSubmitting(true);
    setErr(null);
    try {
      const r = await api<{ campaign: { id: number } }>("/campaigns", {
        body: {
          name: name.trim(), message, media, fallbackName, appendOptOut, consent,
          minDelaySec: minDelay, maxDelaySec: maxDelay,
          contactIds: [...selC], groupIds: [...selG],
        },
      });
      toast("success", "Disparo iniciado!");
      nav(`/historico/${r.campaign.id}`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      await api("/whatsapp/sync", { method: "POST" });
      toast("info", "Sincronizando… a lista será atualizada em alguns segundos.");
      setTimeout(() => { void contactsQ.reload(true); void groupsQ.reload(true); }, 6000);
      setTimeout(() => { void contactsQ.reload(true); void groupsQ.reload(true); setSyncing(false); }, 20000);
    } catch (e: any) {
      toast("error", e.message);
      setSyncing(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Campanha" title="Criar Disparo" subtitle="Escreva a mensagem, personalize com variáveis e escolha quem vai receber." />

      {!me?.whatsapp.connected && (
        <div className="mb-5"><InfoNote tone="amber">Nenhum WhatsApp conectado. <Link to="/conexao" className="underline font-semibold">Conecte um número</Link> para enviar mensagens.</InfoNote></div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.05fr_1fr] items-start">
        {/* ---------- Editor ---------- */}
        <Card className="p-5 sm:p-6 animate-rise">
          <div>
            <label className="label" htmlFor="cname">Nome da campanha</label>
            <input id="cname" className="field" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Lembrete de consultas — novembro" />
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="label !mb-0">Mensagem</span>
              <span className={cx("text-[11px] font-mono", message.length > 3800 ? "text-amber-soft" : "text-ink-400")}>{message.length}/4096</span>
            </div>
            <div className="rounded-2xl border border-white/8 bg-ink-900 focus-within:border-leaf-500/50 focus-within:shadow-[0_0_0_4px_rgba(47,210,124,0.1)] transition-all">
              <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-white/5">
                <div className="relative">
                  <button onClick={() => setShowVars((v) => !v)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-leaf-300 hover:bg-leaf-500/10"><Braces className="size-4" /> Inserir variável</button>
                  <Popover open={showVars} onClose={() => setShowVars(false)}>
                    {TEMPLATE_VARIABLES.map((v) => (
                      <button key={v.key} onClick={() => { insert(`{{${v.key}}}`); setShowVars(false); }} className="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5">
                        <span className="font-mono text-leaf-300 text-[12.5px]">{`{{${v.key}}}`}</span><span className="text-ink-400 text-xs">{v.label}</span>
                      </button>
                    ))}
                  </Popover>
                </div>
                <div className="relative">
                  <button onClick={() => setShowEmoji((v) => !v)} className="rounded-lg p-2 text-ink-300 hover:text-ink-100 hover:bg-white/5" title="Emojis" aria-label="Emojis"><Smile className="size-4" /></button>
                  <Popover open={showEmoji} onClose={() => setShowEmoji(false)}>
                    <div className="grid grid-cols-8 gap-0.5 w-[288px]">
                      {EMOJIS.map((e) => <button key={e} onClick={() => insert(e)} className="rounded-lg p-1.5 text-xl hover:bg-white/8 transition-transform hover:scale-110">{e}</button>)}
                    </div>
                  </Popover>
                </div>
                <span className="mx-1 h-5 w-px bg-white/8" />
                <button onClick={() => wrap("*")} className="rounded-lg px-2.5 py-1.5 text-sm font-bold text-ink-300 hover:text-ink-100 hover:bg-white/5" title="Negrito">B</button>
                <button onClick={() => wrap("_")} className="rounded-lg px-2.5 py-1.5 text-sm italic text-ink-300 hover:text-ink-100 hover:bg-white/5" title="Itálico">I</button>
                <button onClick={() => wrap("~")} className="rounded-lg px-2.5 py-1.5 text-sm line-through text-ink-300 hover:text-ink-100 hover:bg-white/5" title="Tachado">S</button>
                <span className="mx-1 h-5 w-px bg-white/8" />
                <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-ink-300 hover:text-ink-100 hover:bg-white/5 disabled:opacity-50">
                  <Paperclip className="size-4" /> {uploading ? "Enviando…" : "Anexar"}
                </button>
                <input ref={fileRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,video/mp4,video/3gpp,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" onChange={(e) => onFile(e.target.files?.[0])} />
              </div>
              <textarea ref={taRef} value={message} maxLength={4096} onChange={(e) => setMessage(e.target.value)} rows={11}
                className="w-full resize-y bg-transparent px-4 py-3.5 text-[15px] leading-relaxed outline-none placeholder:text-ink-500 min-h-[240px]"
                placeholder={"Olá, {{nome}}! Tudo bem?\n\nEstamos entrando em contato para lembrar que seu compromisso está marcado para o dia {{data}}, às {{hora}}.\n\nAguardamos você!"} />
              {media && (
                <div className="mx-3 mb-3 flex items-center gap-3 rounded-xl border border-white/8 bg-ink-850 p-2.5">
                  {mediaPreview ? <img src={mediaPreview} alt="" className="size-12 rounded-lg object-cover" /> : (
                    <div className="grid place-items-center size-12 rounded-lg bg-ink-750 text-ink-300">{media.type === "video" ? <Film className="size-5" /> : media.type === "image" ? <ImageIcon className="size-5" /> : <FileText className="size-5" />}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{media.name}</div>
                    <div className="text-xs text-ink-400">{media.type === "image" ? "Imagem" : media.type === "video" ? "Vídeo" : "Documento"} · {(media.size / 1024 / 1024).toFixed(2).replace(".", ",")} MB · o texto vai como legenda</div>
                  </div>
                  <button onClick={() => { setMedia(null); setMediaPreview(null); }} className="p-1.5 rounded-lg text-ink-400 hover:text-rose-soft hover:bg-rose-soft/10" aria-label="Remover anexo"><X className="size-4" /></button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="fb">Nome padrão (quando o contato não tiver nome)</label>
              <input id="fb" className="field" maxLength={60} value={fallbackName} onChange={(e) => setFallbackName(e.target.value)} placeholder="Ex.: cliente" />
            </div>
            <div>
              <span className="label">Intervalo entre envios (segundos)</span>
              <div className="flex items-center gap-2">
                <input type="number" min={3} max={600} className="field font-mono" value={minDelay ?? ""} onChange={(e) => setMinDelay(Math.max(3, Number(e.target.value)))} aria-label="Mínimo" />
                <span className="text-ink-400 text-sm">a</span>
                <input type="number" min={3} max={900} className="field font-mono" value={maxDelay ?? ""} onChange={(e) => setMaxDelay(Math.max(minDelay ?? 3, Number(e.target.value)))} aria-label="Máximo" />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Toggle checked={appendOptOut} onChange={setAppendOptOut} label={<>Incluir instrução de descadastro para contatos <span className="text-ink-400">(“{settings?.optOutFooter || "…"}”)</span></>} />
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="label !mb-0">Pré-visualização</span>
              {previewTarget && <span className="text-[11.5px] text-ink-400">como {previewTarget.label} verá</span>}
            </div>
            <WaPreview text={previewText} media={media} imageUrl={mediaPreview} title={previewTarget ? previewTarget.label : "Selecione um destinatário para ver os dados reais"} />
          </div>
        </Card>

        {/* ---------- Destinatários ---------- */}
        <Card className="p-5 sm:p-6 animate-rise xl:sticky xl:top-6" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-ink-900 border border-white/5 flex-1 sm:flex-none">
              <button onClick={() => setTab("contacts")} className={cx("flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all", tab === "contacts" ? "bg-ink-750 text-ink-100" : "text-ink-400 hover:text-ink-200")}>
                <Users className="size-4" /> Contatos {selC.size > 0 && <span className="rounded-full bg-leaf-500 text-ink-950 px-1.5 text-[11px] font-bold">{fmtInt(selC.size)}</span>}
              </button>
              <button onClick={() => setTab("groups")} className={cx("flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all", tab === "groups" ? "bg-ink-750 text-ink-100" : "text-ink-400 hover:text-ink-200")}>
                <UsersRound className="size-4" /> Grupos {selG.size > 0 && <span className="rounded-full bg-leaf-500 text-ink-950 px-1.5 text-[11px] font-bold">{fmtInt(selG.size)}</span>}
              </button>
            </div>
            <Button variant="ghost" size="sm" onClick={syncNow} loading={syncing} disabled={!me?.whatsapp.connected} icon={<RefreshCw className="size-3.5" />} title="Importar novamente do WhatsApp">
              <span className="hidden sm:inline">Sincronizar</span>
            </Button>
          </div>

          <div className="mt-4">
            {tab === "contacts" ? (
              <SelectableList<Contact>
                items={contacts}
                selected={selC}
                onChange={setSelC}
                placeholder="Pesquisar por nome ou número"
                searchText={(c) => `${c.name ?? ""} ${c.notify ?? ""} ${c.phone ?? ""}`}
                empty={contactsQ.loading ? "Carregando contatos…" : <span>Nenhum contato importado ainda.<br />Conecte o WhatsApp ou clique em Sincronizar.</span>}
                renderRow={(c) => (
                  <>
                    <Avatar name={contactName(c)} src={c.imgUrl} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{contactName(c)}</div>
                      <div className="text-xs text-ink-400 font-mono truncate">{c.phone ? formatPhone(c.phone) : "número oculto (ID privado)"}</div>
                    </div>
                    {c.source === "manual" && <Badge>manual</Badge>}
                  </>
                )}
              />
            ) : (
              <SelectableList<Group>
                items={groups}
                selected={selG}
                onChange={setSelG}
                placeholder="Pesquisar grupos pelo nome"
                searchText={(g) => g.subject}
                isDisabled={(g) => !g.canSend}
                empty={groupsQ.loading ? "Carregando grupos…" : "Nenhum grupo encontrado na conta conectada."}
                renderRow={(g) => (
                  <>
                    <Avatar name={g.subject} src={g.imgUrl} size={36} group />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{g.subject || "Grupo sem nome"}</div>
                      <div className="text-xs text-ink-400">{g.size != null ? `${fmtInt(g.size)} participantes` : "participantes indisponíveis"}</div>
                    </div>
                    {!g.canSend ? <Badge tone="amber"><Lock className="size-3" /> só admins</Badge> : g.isAdmin ? <Badge tone="green">admin</Badge> : null}
                  </>
                )}
              />
            )}
          </div>
          {tab === "contacts" && optedOutCount > 0 && (
            <p className="mt-3 text-xs text-ink-400">{fmtInt(optedOutCount)} contato(s) descadastrado(s) não aparecem nesta lista.</p>
          )}
        </Card>
      </div>

      {/* ---------- Barra de ação ---------- */}
      <div className="sticky bottom-3 z-10 mt-6">
        <Card className="!bg-ink-850/95 backdrop-blur-xl p-4 sm:px-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 justify-between">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="flex items-center gap-2"><Users className="size-4 text-leaf-400" /><b className="font-mono">{fmtInt(selC.size)}</b> contatos</span>
            <span className="flex items-center gap-2"><UsersRound className="size-4 text-leaf-400" /><b className="font-mono">{fmtInt(selG.size)}</b> grupos</span>
            {totalSel > 0 && <span className="flex items-center gap-2 text-ink-400"><Timer className="size-4" /> ~{etaMin} min estimados</span>}
          </div>
          <Button size="lg" disabled={!canStart} onClick={openConfirm} icon={<Rocket className="size-5" />} className="tracking-wide sm:min-w-[260px]">
            INICIAR DISPARO
          </Button>
        </Card>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} wide title="Confirmar disparo"
        footer={<>
          <Button variant="ghost" onClick={() => setConfirm(false)}>Voltar e editar</Button>
          <Button onClick={start} loading={submitting} disabled={!consent} icon={<Rocket className="size-4" />}>Confirmar e iniciar</Button>
        </>}>
        <div className="grid gap-5 md:grid-cols-[1fr_1.1fr]">
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="cname2">Nome da campanha</label>
              <input id="cname2" className="field" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/6 bg-ink-900 p-3.5"><div className="text-xs text-ink-400">Contatos</div><div className="mt-1 font-display text-2xl font-semibold">{fmtInt(selC.size)}</div></div>
              <div className="rounded-xl border border-white/6 bg-ink-900 p-3.5"><div className="text-xs text-ink-400">Grupos</div><div className="mt-1 font-display text-2xl font-semibold">{fmtInt(selG.size)}</div></div>
            </div>
            <ul className="text-sm text-ink-300 space-y-1.5">
              <li className="flex items-center gap-2"><Timer className="size-4 text-ink-400" /> Intervalo aleatório de {minDelay}–{maxDelay}s entre mensagens</li>
              {settings && settings.batchSize > 0 && <li className="flex items-center gap-2"><Megaphone className="size-4 text-ink-400" /> Pausa de {Math.round(settings.batchPauseSec / 60 * 10) / 10} min a cada {settings.batchSize} envios</li>}
              {settings && <li className="flex items-center gap-2"><Lock className="size-4 text-ink-400" /> Limite diário da conta: {fmtInt(settings.dailyLimit)} envios</li>}
              <li className="flex items-center gap-2"><Timer className="size-4 text-ink-400" /> Duração estimada: ~{etaMin} min</li>
            </ul>
            <label className="flex items-start gap-3 rounded-xl border border-leaf-500/20 bg-leaf-500/[0.05] p-3.5 cursor-pointer" onClick={() => setConsent(!consent)}>
              <Checkbox checked={consent} onChange={setConsent} />
              <span className="text-sm text-ink-200 leading-relaxed">Confirmo que todos os destinatários autorizaram receber mensagens deste número e que poderão se descadastrar a qualquer momento.</span>
            </label>
            {err && <ErrorNote>{err}</ErrorNote>}
          </div>
          <div>
            <span className="label">Como a mensagem será recebida</span>
            <WaPreview text={previewText} media={media} imageUrl={mediaPreview} title={previewTarget?.label} />
            <details className="mt-3 text-xs text-ink-400">
              <summary className="cursor-pointer hover:text-ink-200">Ver texto original com variáveis</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-ink-900 border border-white/5 p-3 font-mono text-[12px] text-ink-300">{message || "(sem texto)"}</pre>
            </details>
          </div>
        </div>
      </Modal>
    </>
  );
}
