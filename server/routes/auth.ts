import { Hono } from "hono";
import { and, eq, gte, sql, count } from "drizzle-orm";
import { db, users, authSessions, activityLogs, waConnections } from "../../db/index.js";
import { verifyPassword, hashPassword } from "../lib/crypto.js";
import { createSession, destroySession, requireAuth, clientIp, type AppEnv } from "../lib/auth.js";
import { logActivity } from "../lib/store.js";
import { isLive } from "../wa/manager.js";

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!username || !password) return c.json({ error: "Informe usuário e senha" }, 400);
  const ip = clientIp(c);

  // Proteção contra força bruta: máx. 8 falhas por usuário e 30 por IP a cada 15 minutos.
  const since = new Date(Date.now() - 15 * 60_000);
  const [byUser] = await db.select({ n: count() }).from(activityLogs).where(and(
    eq(activityLogs.action, "auth.login_failed"), gte(activityLogs.createdAt, since), sql`${activityLogs.details}->>'username' = ${username}`));
  const [byIp] = ip
    ? await db.select({ n: count() }).from(activityLogs).where(and(eq(activityLogs.action, "auth.login_failed"), gte(activityLogs.createdAt, since), eq(activityLogs.ip, ip)))
    : [{ n: 0 }];
  if (Number(byUser.n) >= 8 || Number(byIp.n) >= 30) {
    return c.json({ error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." }, 429);
  }

  const [u] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const ok = u ? await verifyPassword(password, u.passwordHash) : await verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA").then(() => false);
  if (!u || !ok) {
    await logActivity({ userId: u?.id ?? null, action: "auth.login_failed", details: { username }, ip });
    return c.json({ error: "Usuário ou senha incorretos" }, 401);
  }
  if (!u.active) {
    await logActivity({ userId: u.id, action: "auth.login_blocked", details: { username }, ip });
    return c.json({ error: "Usuário desativado. Fale com o administrador." }, 403);
  }
  await createSession(c, u.id);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
  await logActivity({ userId: u.id, actorId: u.id, action: "auth.login", ip });
  return c.json({ ok: true });
});

authRoutes.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  const scope = c.get("scopeUserId");
  const [wa] = await db.select({ status: waConnections.status, phone: waConnections.phone, pushName: waConnections.pushName, registered: waConnections.registered })
    .from(waConnections).where(eq(waConnections.userId, scope));
  let viewing = null;
  if (c.get("viewingAs")) {
    const [t] = await db.select({ id: users.id, username: users.username, name: users.name, role: users.role }).from(users).where(eq(users.id, scope));
    viewing = t ?? null;
  }
  return c.json({
    user,
    viewing,
    whatsapp: {
      status: wa?.status ?? "disconnected",
      connected: !!wa?.registered && wa?.status === "connected",
      phone: wa?.phone ?? null,
      pushName: wa?.pushName ?? null,
      live: isLive(scope),
    },
  });
});

authRoutes.post("/password", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const current = String(body.current ?? "");
  const next = String(body.next ?? "");
  if (next.length < 8) return c.json({ error: "A nova senha precisa ter pelo menos 8 caracteres" }, 400);
  const [u] = await db.select().from(users).where(eq(users.id, user.id));
  if (!u || !(await verifyPassword(current, u.passwordHash))) return c.json({ error: "Senha atual incorreta" }, 400);
  await db.update(users).set({ passwordHash: await hashPassword(next), mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, user.id));
  // Encerra as demais sessões abertas.
  await db.delete(authSessions).where(and(eq(authSessions.userId, user.id), sql`${authSessions.id} <> ${c.get("sessionId")}`));
  await logActivity({ userId: user.id, actorId: user.id, action: "auth.password_changed", ip: clientIp(c) });
  return c.json({ ok: true });
});
