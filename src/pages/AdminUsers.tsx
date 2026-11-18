import { useState } from "react";
import { UserPlus, Pencil, Trash2, ShieldCheck, User as UserIcon, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, fmtDate, fmtInt, formatPhone, timeAgo } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useSession } from "../lib/session";
import { Button, Card, PageHeader, Modal, Toggle, ErrorNote, Badge, Skeleton, Checkbox, useToast, cx } from "../components/ui";

export type AdminUser = {
  id: number; username: string; name: string; role: "admin" | "user"; active: boolean; mustChangePassword: boolean; createdAt: string; lastLoginAt: string | null;
  whatsapp: { status: string; connected: boolean; phone: string | null; name: string | null; live: boolean };
  stats: { contacts: number; groups: number; campaigns: number; sent: number; failed: number };
};

type FormState = { id?: number; username: string; name: string; password: string; role: "admin" | "user"; active: boolean; mustChangePassword: boolean };
const blank: FormState = { username: "", name: "", password: "", role: "user", active: true, mustChangePassword: false };

function genPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return [...arr].map((n) => chars[n % chars.length]).join("");
}

export default function AdminUsersPage() {
  const { me, viewAs } = useSession();
  const toast = useToast();
  const nav = useNavigate();
  const { data, loading, reload } = useApi<{ users: AdminUser[] }>("/admin/users");
  const [form, setForm] = useState<FormState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<AdminUser | null>(null);
  const [showPw, setShowPw] = useState(false);

  async function save() {
    if (!form) return;
    setSaving(true); setErr(null);
    try {
      if (form.id) {
        await api(`/admin/users/${form.id}`, { method: "PATCH", body: { username: form.username, name: form.name, role: form.role, active: form.active, password: form.password || undefined, mustChangePassword: form.mustChangePassword } });
        toast("success", "Usuário atualizado.");
      } else {
        await api("/admin/users", { body: form });
        toast("success", `Usuário @${form.username} criado.`);
      }
      setForm(null);
      await reload(true);
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  }

  async function quickToggle(u: AdminUser) {
    try {
      await api(`/admin/users/${u.id}`, { method: "PATCH", body: { active: !u.active } });
      toast("success", u.active ? "Usuário desativado." : "Usuário reativado.");
      await reload(true);
    } catch (e: any) { toast("error", e.message); }
  }

  async function remove() {
    if (!del) return;
    setSaving(true);
    try {
      await api(`/admin/users/${del.id}`, { method: "DELETE" });
      toast("success", "Usuário excluído.");
      setDel(null);
      await reload(true);
    } catch (e: any) { toast("error", e.message); } finally { setSaving(false); }
  }

  const users = data?.users ?? [];
  return (
    <>
      <PageHeader eyebrow="Administração" title="Gerenciar Usuários" subtitle="Crie acessos, defina cargos e senhas. Cada usuário conecta o próprio WhatsApp e tem dados isolados."
        actions={<Button icon={<UserPlus className="size-4" />} onClick={() => { setErr(null); setShowPw(true); setForm({ ...blank, password: genPassword() }); }}>Novo usuário</Button>} />

      <Card className="animate-rise overflow-hidden">
        {loading && !data ? <div className="p-6 space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-ink-400 border-b border-white/5">
                <th className="px-6 py-3 font-medium">Usuário</th><th className="px-3 py-3 font-medium">Cargo</th><th className="px-3 py-3 font-medium">WhatsApp</th>
                <th className="px-3 py-3 font-medium text-right">Campanhas</th><th className="px-3 py-3 font-medium text-right">Enviadas</th><th className="px-3 py-3 font-medium">Último acesso</th><th className="px-3 py-3 font-medium">Ativo</th><th className="px-6 py-3" />
              </tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {users.map((u) => (
                  <tr key={u.id} className={cx("hover:bg-white/[0.015]", !u.active && "opacity-55")}>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={cx("grid place-items-center size-9 rounded-full font-semibold", u.role === "admin" ? "bg-leaf-900 text-leaf-300" : "bg-ink-700 text-ink-200")}>{(u.name || u.username)[0]?.toUpperCase()}</div>
                        <div><div className="font-semibold">{u.name}</div><div className="text-xs text-ink-400">@{u.username}{u.id === me?.user.id && " · você"}</div></div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5">{u.role === "admin" ? <Badge tone="green"><ShieldCheck className="size-3" /> Admin</Badge> : <Badge><UserIcon className="size-3" /> Usuário</Badge>}</td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-2"><span className={cx("size-2 rounded-full", u.whatsapp.connected ? "bg-leaf-500" : "bg-rose-soft")} /><span className="font-mono text-xs">{u.whatsapp.phone ? formatPhone(u.whatsapp.phone) : "não conectado"}</span></div>
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono">{fmtInt(u.stats.campaigns)}</td>
                    <td className="px-3 py-3.5 text-right font-mono">{fmtInt(u.stats.sent)}</td>
                    <td className="px-3 py-3.5 text-xs text-ink-300" title={fmtDate(u.lastLoginAt)}>{timeAgo(u.lastLoginAt)}</td>
                    <td className="px-3 py-3.5"><Toggle checked={u.active} disabled={u.id === me?.user.id} onChange={() => quickToggle(u)} /></td>
                    <td className="px-6 py-3.5">
                      <div className="flex justify-end gap-1">
                        {u.id !== me?.user.id && <button title="Acessar painel" onClick={async () => { await viewAs(u.id); nav("/"); }} className="p-2 rounded-lg text-ink-400 hover:text-leaf-300 hover:bg-leaf-500/10"><Eye className="size-4" /></button>}
                        <button title="Editar" onClick={() => { setErr(null); setShowPw(false); setForm({ id: u.id, username: u.username, name: u.name, password: "", role: u.role, active: u.active, mustChangePassword: false }); }} className="p-2 rounded-lg text-ink-400 hover:text-ink-100 hover:bg-white/5"><Pencil className="size-4" /></button>
                        {u.id !== me?.user.id && <button title="Excluir" onClick={() => setDel(u)} className="p-2 rounded-lg text-ink-400 hover:text-rose-soft hover:bg-rose-soft/10"><Trash2 className="size-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Editar usuário" : "Novo usuário"}
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={save} loading={saving}>{form?.id ? "Salvar alterações" : "Criar usuário"}</Button></>}>
        {form && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className="label">Nome</label><input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome completo" /></div>
              <div><label className="label">Usuário (login)</label><input className="field" autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })} placeholder="maria.souza" /></div>
            </div>
            <div>
              <label className="label">{form.id ? "Nova senha (deixe em branco para manter)" : "Senha"}</label>
              <div className="flex gap-2">
                <input className="field font-mono" type={showPw ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={form.id ? "••••••••" : "mínimo de 8 caracteres"} />
                <Button variant="outline" type="button" onClick={() => setShowPw(!showPw)}>{showPw ? "Ocultar" : "Mostrar"}</Button>
                <Button variant="outline" type="button" onClick={() => { setShowPw(true); setForm({ ...form, password: genPassword() }); }}>Gerar</Button>
              </div>
              <p className="mt-1.5 text-xs text-ink-400">A senha é guardada apenas como hash (scrypt). Anote-a antes de salvar para repassar ao usuário.</p>
            </div>
            <div>
              <span className="label">Tipo de usuário</span>
              <div className="grid grid-cols-2 gap-2">
                {(["user", "admin"] as const).map((r) => (
                  <button key={r} type="button" disabled={form.id === me?.user.id} onClick={() => setForm({ ...form, role: r })}
                    className={cx("rounded-xl border p-3 text-left transition-all disabled:opacity-50", form.role === r ? "border-leaf-500/40 bg-leaf-500/8" : "border-white/8 hover:border-white/15")}>
                    <div className="flex items-center gap-2 font-semibold text-sm">{r === "admin" ? <ShieldCheck className="size-4 text-leaf-400" /> : <UserIcon className="size-4 text-ink-300" />}{r === "admin" ? "Administrador" : "Usuário comum"}</div>
                    <div className="mt-1 text-xs text-ink-400">{r === "admin" ? "Gerencia usuários e vê todos os painéis" : "Acessa somente o próprio painel"}</div>
                  </button>
                ))}
              </div>
            </div>
            {(form.password || !form.id) && (
              <label className="flex items-center gap-3 cursor-pointer text-sm text-ink-300" onClick={() => setForm({ ...form, mustChangePassword: !form.mustChangePassword })}>
                <Checkbox checked={form.mustChangePassword} onChange={(v) => setForm({ ...form, mustChangePassword: v })} /> Pedir para o usuário trocar a senha no primeiro acesso
              </label>
            )}
            {form.id && form.id !== me?.user.id && <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Usuário ativo" />}
            {err && <ErrorNote>{err}</ErrorNote>}
          </div>
        )}
      </Modal>

      <Modal open={!!del} onClose={() => setDel(null)} title="Excluir usuário?"
        footer={<><Button variant="ghost" onClick={() => setDel(null)}>Cancelar</Button><Button variant="danger" loading={saving} onClick={remove}>Excluir definitivamente</Button></>}>
        <p className="text-sm text-ink-300 leading-relaxed">
          <b className="text-ink-100">@{del?.username}</b> perderá o acesso. O WhatsApp conectado será desvinculado e todos os contatos, campanhas e históricos deste usuário serão apagados. Para apenas bloquear o acesso, prefira <b>desativar</b>.
        </p>
      </Modal>
    </>
  );
}
