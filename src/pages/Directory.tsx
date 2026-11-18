import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, UserPlus, Users, UsersRound, Trash2, BellOff, Bell, Lock } from "lucide-react";
import { api, fmtInt, formatPhone } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useSession } from "../lib/session";
import { Button, Card, PageHeader, Modal, Avatar, Badge, ErrorNote, InfoNote, Checkbox, useToast, cx } from "../components/ui";
import { SelectableList, contactName, type Contact, type Group } from "../components/SelectableList";

function useSync(onDone: () => void) {
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);
  const run = async () => {
    setSyncing(true);
    try {
      await api("/whatsapp/sync", { method: "POST" });
      toast("info", "Sincronizando com o WhatsApp…");
      setTimeout(onDone, 6000);
      setTimeout(() => { onDone(); setSyncing(false); toast("success", "Lista atualizada."); }, 20000);
    } catch (e: any) {
      toast("error", e.message);
      setSyncing(false);
    }
  };
  return { syncing, run };
}

export function ContactsPage() {
  const { me } = useSession();
  const toast = useToast();
  const q = useApi<{ contacts: Contact[] }>("/contacts");
  const [filter, setFilter] = useState<"all" | "optout">("all");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "55", consent: false });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sync = useSync(() => void q.reload(true));
  const all = q.data?.contacts ?? [];
  const list = useMemo(() => (filter === "optout" ? all.filter((c) => c.optedOut) : all), [all, filter]);
  const optedOut = all.filter((c) => c.optedOut).length;

  async function toggleOptOut(c: Contact) {
    try {
      await api(`/contacts/${c.id}`, { method: "PATCH", body: { optedOut: !c.optedOut } });
      q.setData({ contacts: all.map((x) => (x.id === c.id ? { ...x, optedOut: !c.optedOut } : x)) });
      toast("success", c.optedOut ? "Contato reativado para receber mensagens." : "Contato descadastrado.");
    } catch (e: any) { toast("error", e.message); }
  }
  async function remove(c: Contact) {
    if (!confirm(`Remover ${contactName(c)} da lista?`)) return;
    try {
      await api(`/contacts/${c.id}`, { method: "DELETE" });
      q.setData({ contacts: all.filter((x) => x.id !== c.id) });
    } catch (e: any) { toast("error", e.message); }
  }
  async function add() {
    setSaving(true); setErr(null);
    try {
      await api("/contacts", { body: form });
      setAdding(false);
      setForm({ name: "", phone: "55", consent: false });
      await q.reload(true);
      toast("success", "Contato adicionado.");
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  }

  return (
    <>
      <PageHeader eyebrow="Diretório" title="Contatos" subtitle="Importados automaticamente do WhatsApp conectado. Descadastrados nunca recebem disparos."
        actions={<>
          <Button variant="outline" icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>Adicionar</Button>
          <Button icon={<RefreshCw className="size-4" />} loading={sync.syncing} disabled={!me?.whatsapp.connected} onClick={sync.run}>Sincronizar</Button>
        </>} />
      {!me?.whatsapp.connected && <div className="mb-5"><InfoNote tone="amber">Conecte o WhatsApp em <Link to="/conexao" className="underline font-semibold">Conexão</Link> para importar seus contatos.</InfoNote></div>}
      <Card className="p-5 sm:p-6 animate-rise">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {([["all", `Todos · ${fmtInt(all.length)}`], ["optout", `Descadastrados · ${fmtInt(optedOut)}`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={cx("rounded-full px-3.5 py-1.5 text-[13px] font-semibold border transition-all", filter === k ? "bg-leaf-500/12 border-leaf-500/30 text-leaf-300" : "border-white/8 text-ink-300 hover:text-ink-100")}>{l}</button>
          ))}
        </div>
        <SelectableList<Contact>
          items={list}
          selectable={false}
          height={560}
          placeholder="Pesquisar por nome ou número"
          searchText={(c) => `${c.name ?? ""} ${c.notify ?? ""} ${c.phone ?? ""}`}
          empty={q.loading ? "Carregando…" : <span>Nenhum contato por aqui ainda.</span>}
          renderRow={(c) => (
            <>
              <Avatar name={contactName(c)} src={c.imgUrl} size={36} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate flex items-center gap-2">{contactName(c)} {c.optedOut && <Badge tone="rose">descadastrado</Badge>} {c.source === "manual" && <Badge>manual</Badge>}</div>
                <div className="text-xs text-ink-400 font-mono truncate">{c.phone ? formatPhone(c.phone) : "número oculto (ID privado)"}{c.notify && c.name && c.notify !== c.name ? ` · ~${c.notify}` : ""}</div>
              </div>
              <button onClick={() => toggleOptOut(c)} title={c.optedOut ? "Reativar" : "Descadastrar"} className={cx("p-2 rounded-lg transition-colors", c.optedOut ? "text-leaf-400 hover:bg-leaf-500/10" : "text-ink-400 hover:text-amber-soft hover:bg-amber-soft/10")}>
                {c.optedOut ? <Bell className="size-4" /> : <BellOff className="size-4" />}
              </button>
              {!c.optedOut && (
                <button onClick={() => remove(c)} title="Remover" className="p-2 rounded-lg text-ink-400 hover:text-rose-soft hover:bg-rose-soft/10"><Trash2 className="size-4" /></button>
              )}
            </>
          )}
        />
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Adicionar contato"
        footer={<><Button variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button><Button onClick={add} loading={saving} disabled={!form.consent}>Salvar contato</Button></>}>
        <div className="space-y-4">
          <div><label className="label" htmlFor="nn">Nome</label><input id="nn" className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome e sobrenome" /></div>
          <div><label className="label" htmlFor="np">WhatsApp com DDI e DDD</label><input id="np" className="field font-mono" inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })} placeholder="5511987654321" /></div>
          <label className="flex items-start gap-3 cursor-pointer" onClick={() => setForm({ ...form, consent: !form.consent })}>
            <Checkbox checked={form.consent} onChange={(v) => setForm({ ...form, consent: v })} />
            <span className="text-sm text-ink-300">Este contato autorizou receber mensagens deste número.</span>
          </label>
          {err && <ErrorNote>{err}</ErrorNote>}
        </div>
      </Modal>
    </>
  );
}

export function GroupsPage() {
  const { me } = useSession();
  const q = useApi<{ groups: Group[] }>("/groups");
  const sync = useSync(() => void q.reload(true));
  const groups = q.data?.groups ?? [];
  const sendable = groups.filter((g) => g.canSend).length;
  return (
    <>
      <PageHeader eyebrow="Diretório" title="Grupos" subtitle="Grupos dos quais o número conectado participa. Grupos onde só administradores enviam ficam bloqueados para disparo."
        actions={<>
          <Link to="/disparo"><Button variant="outline" icon={<UsersRound className="size-4" />}>Enviar para grupos</Button></Link>
          <Button icon={<RefreshCw className="size-4" />} loading={sync.syncing} disabled={!me?.whatsapp.connected} onClick={sync.run}>Sincronizar</Button>
        </>} />
      <div className="mb-5 grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-xl">
        <Card className="p-4"><div className="text-xs text-ink-400">Grupos</div><div className="font-display text-2xl font-semibold mt-1">{fmtInt(groups.length)}</div></Card>
        <Card className="p-4"><div className="text-xs text-ink-400">Liberados para envio</div><div className="font-display text-2xl font-semibold mt-1">{fmtInt(sendable)}</div></Card>
      </div>
      <Card className="p-5 sm:p-6 animate-rise">
        <SelectableList<Group>
          items={groups}
          selectable={false}
          height={560}
          placeholder="Pesquisar grupos pelo nome"
          searchText={(g) => g.subject}
          empty={q.loading ? "Carregando…" : <span className="flex flex-col items-center gap-2"><Users className="size-6" />Nenhum grupo encontrado.</span>}
          renderRow={(g) => (
            <>
              <Avatar name={g.subject} src={g.imgUrl} size={36} group />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{g.subject || "Grupo sem nome"}</div>
                <div className="text-xs text-ink-400">{g.size != null ? `${fmtInt(g.size)} participantes` : "participantes indisponíveis"}</div>
              </div>
              {!g.canSend ? <Badge tone="amber"><Lock className="size-3" /> só admins enviam</Badge> : g.isAdmin ? <Badge tone="green">você é admin</Badge> : <Badge>membro</Badge>}
            </>
          )}
        />
      </Card>
    </>
  );
}
