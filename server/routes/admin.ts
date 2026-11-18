import { Hono } from "hono";
import { and, desc, eq, ne, sql, count } from "drizzle-orm";
import { db, users, authSessions, activityLogs, campaigns, waConnections, userSettings } from "../../db/index.js";
import { hashPassword } from "../lib/crypto.js";
import { clientIp, type AppEnv } from "../lib/auth.js";
import { logActivity, rows, getSettings } from "../lib/store.js";
import { campaignCounts, summarize, userStats } from "../lib/stats.js";
import { disconnect, isLive } from "../wa/manager.js";
import { mediaStore } from "../worker.js";

export const adminRoutes = new Hono<AppEnv>();

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

async function activeAdminCount(excludeId?: number) {
  const conds = [eq(users.role, "admin"), eq(users.active, true)];
  if (excludeId) conds.push(ne(users.id, excludeId));
  const [{ n }] = await db.select({ n: count() }).from(users).where(and(...conds));
  return Number(n);
}

adminRoutes.get("/users", async (c) => {
  const list = rows<any>(await db.execute(sql`
    select u.id, u.username, u.name, u.role, u.active, u.must_change_password, u.created_at, u.last_login_at,
      w.status as wa_status, w.phone as wa_phone, w.push_name as wa_name, coalesce(w.registered, false) as wa_registered,
      (select count(*)::int from contacts c where c.user_id = u.id and c.opted_out = false) as contacts,
      (select count(*)::int from wa_groups g where g.user_id = u.id) as groups,
      (select count(*)::int from campaigns k where k.user_id = u.id) as campaigns,
      (select count(*)::int from campaign_recipients r where r.user_id = u.id and r.status in ('sent','delivered','read')) as sent,
      (select count(*)::int from campaign_recipients r where r.user_id = u.id and r.status = 'failed') as failed
    from users u left join wa_connections w on w.user_id = u.id
    order by u.created_at asc`));
  return c.json({
    users: list.map((u) => ({
      id: u.id, username: u.username, name: u.name, role: u.role, active: u.active, mustChangePassword: u.must_change_password,
      createdAt: u.created_at, lastLoginAt: u.last_login_at,
      whatsapp: { status: u.wa_status ?? "disconnected", connected: !!u.wa_registered && u.wa_status === "connected", phone: u.wa_phone, name: u.wa_name, live: isLive(Number(u.id)) },
      stats: { contacts: Number(u.contacts), groups: Number(u.groups), campaigns: Number(u.campaigns), sent: Number(u.sent), failed: Number(u.failed) },
    })),
  });
});

adminRoutes.post("/users", async (c) => {
  const actor = c.get("user");
  const b = await c.req.json().catch(() => ({}));
  const username = String(b.username ?? "").trim().toLowerCase();
  const name = String(b.name ?? "").trim().slice(0, 120);
  const password = String(b.password ?? "");
  const role = b.role === "admin" ? "admin" : "user";
  if (!USERNAME_RE.test(username)) return c.json({ error: "Usuário deve ter 3–32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado" }, 400);
  if (password.length < 8) return c.json({ error: "A senha precisa ter pelo menos 8 caracteres" }, 400);
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (exists) return c.json({ error: "Este nome de usuário já está em uso" }, 409);
  const [u] = await db.insert(users).values({
    username, name: name || username, role, passwordHash: await hashPassword(password), mustChangePassword: b.mustChangePassword === true,
  }).returning({ id: users.id });
  await db.insert(userSettings).values({ userId: u.id }).onConflictDoNothing();
  await logActivity({ userId: u.id, actorId: actor.id, action: "admin.user_created", details: { username, role }, ip: clientIp(c) });
  return c.json({ user: { id: u.id } }, 201);
});

adminRoutes.get("/users/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [u] = await db.select({
    id: users.id, username: users.username, name: users.name, role: users.role, active: users.active,
    createdAt: users.createdAt, lastLoginAt: users.lastLoginAt, mustChangePassword: users.mustChangePassword,
  }).from(users).where(eq(users.id, id));
  if (!u) return c.json({ error: "Usuário não encontrado" }, 404);
  const settings = await getSettings(id);
  const stats = await userStats(id, settings.timezone);
  const [wa] = await db.select({
    status: waConnections.status, phone: waConnections.phone, pushName: waConnections.pushName, registered: waConnections.registered,
    lastConnectedAt: waConnections.lastConnectedAt, lastSyncAt: waConnections.lastSyncAt, lastError: waConnections.lastError, profilePicUrl: waConnections.profilePicUrl,
  }).from(waConnections).where(eq(waConnections.userId, id));
  const recent = await db.select().from(campaigns).where(eq(campaigns.userId, id)).orderBy(desc(campaigns.createdAt)).limit(10);
  const counts = await campaignCounts(recent.map((x) => x.id));
  const logs = await db.select().from(activityLogs).where(eq(activityLogs.userId, id)).orderBy(desc(activityLogs.createdAt)).limit(60);
  return c.json({
    user: u,
    whatsapp: { ...(wa ?? { status: "disconnected" }), connected: !!wa?.registered && wa?.status === "connected", live: isLive(id) },
    stats,
    campaigns: recent.map((x) => ({ id: x.id, name: x.name, status: x.status, createdAt: x.createdAt, stats: summarize(counts.get(x.id)!, x.totalRecipients) })),
    logs,
  });
});

adminRoutes.patch("/users/:id", async (c) => {
  const actor = c.get("user");
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) return c.json({ error: "Usuário não encontrado" }, 404);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  const changes: string[] = [];

  if (typeof b.name === "string") { set.name = b.name.trim().slice(0, 120) || u.username; changes.push("name"); }
  if (typeof b.username === "string" && b.username.trim().toLowerCase() !== u.username) {
    const username = b.username.trim().toLowerCase();
    if (!USERNAME_RE.test(username)) return c.json({ error: "Nome de usuário inválido" }, 400);
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
    if (exists) return c.json({ error: "Este nome de usuário já está em uso" }, 409);
    set.username = username; changes.push("username");
  }
  if (b.role === "admin" || b.role === "user") {
    if (b.role !== u.role) {
      if (id === actor.id) return c.json({ error: "Você não pode alterar o seu próprio cargo" }, 400);
      if (u.role === "admin" && (await activeAdminCount(id)) === 0) return c.json({ error: "É preciso manter ao menos um administrador ativo" }, 400);
      set.role = b.role; changes.push("role");
    }
  }
  if (typeof b.active === "boolean" && b.active !== u.active) {
    if (id === actor.id) return c.json({ error: "Você não pode desativar a sua própria conta" }, 400);
    if (!b.active && u.role === "admin" && (await activeAdminCount(id)) === 0) return c.json({ error: "É preciso manter ao menos um administrador ativo" }, 400);
    set.active = b.active; changes.push(b.active ? "activated" : "deactivated");
  }
  if (typeof b.password === "string" && b.password) {
    if (b.password.length < 8) return c.json({ error: "A senha precisa ter pelo menos 8 caracteres" }, 400);
    set.passwordHash = await hashPassword(b.password);
    set.mustChangePassword = b.mustChangePassword === true;
    changes.push("password");
  }
  await db.update(users).set(set).where(eq(users.id, id));
  if (changes.includes("password") || changes.includes("deactivated")) {
    await db.delete(authSessions).where(eq(authSessions.userId, id));
  }
  if (changes.includes("deactivated")) {
    await db.update(campaigns).set({ status: "paused", lastError: "Usuário desativado pelo administrador" }).where(and(eq(campaigns.userId, id), eq(campaigns.status, "running")));
  }
  await logActivity({ userId: id, actorId: actor.id, action: "admin.user_updated", details: { changes }, ip: clientIp(c) });
  return c.json({ ok: true });
});

adminRoutes.delete("/users/:id", async (c) => {
  const actor = c.get("user");
  const id = Number(c.req.param("id"));
  if (id === actor.id) return c.json({ error: "Você não pode excluir a sua própria conta" }, 400);
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) return c.json({ error: "Usuário não encontrado" }, 404);
  if (u.role === "admin" && u.active && (await activeAdminCount(id)) === 0) return c.json({ error: "É preciso manter ao menos um administrador ativo" }, 400);
  await db.update(campaigns).set({ status: "cancelled" }).where(and(eq(campaigns.userId, id), sql`${campaigns.status} in ('running','paused')`));
  await disconnect(id, { logout: true }).catch(() => {});
  try {
    const store = mediaStore();
    const { blobs } = await store.list({ prefix: `${id}/` });
    for (const b of blobs) await store.delete(b.key);
  } catch (e) { console.error("[admin] limpeza de mídia", e); }
  await db.delete(users).where(eq(users.id, id));
  await logActivity({ userId: null, actorId: actor.id, action: "admin.user_deleted", details: { id, username: u.username }, ip: clientIp(c) });
  return c.json({ ok: true });
});

adminRoutes.get("/logs", async (c) => {
  const list = rows<any>(await db.execute(sql`
    select l.id, l.action, l.details, l.ip, l.created_at, l.user_id, l.actor_id, u.username as user_username, a.username as actor_username
    from activity_logs l left join users u on u.id = l.user_id left join users a on a.id = l.actor_id
    order by l.created_at desc limit 200`));
  return c.json({ logs: list });
});
