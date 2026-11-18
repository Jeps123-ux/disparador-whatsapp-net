import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { and, eq, gt } from "drizzle-orm";
import { db, users, authSessions } from "../../db/index.js";
import { randomToken, sha256 } from "./crypto.js";

export const SESSION_COOKIE = "ecoa_sid";
const SESSION_DAYS = 14;

export type SessionUser = {
  id: number;
  username: string;
  name: string;
  role: "admin" | "user";
  mustChangePassword: boolean;
};

export type AppEnv = {
  Variables: {
    user: SessionUser;
    /** Usuário cujos dados estão sendo acessados (o próprio, ou outro quando um admin usa "ver como"). */
    scopeUserId: number;
    viewingAs: boolean;
    sessionId: string;
  };
};

export function clientIp(c: Context): string | null {
  return c.req.header("x-nf-client-connection-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function createSession(c: Context, userId: number) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(authSessions).values({
    id: sha256(token),
    userId,
    expiresAt,
    ip: clientIp(c),
    userAgent: c.req.header("user-agent")?.slice(0, 300) ?? null,
  });
  const secure = new URL(c.req.url).protocol === "https:";
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function destroySession(c: Context) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await db.delete(authSessions).where(eq(authSessions.id, sha256(token)));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Exige sessão válida e usuário ativo. Resolve o escopo de dados (RBAC + "ver como" do admin). */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "Não autenticado" }, 401);
  const sid = sha256(token);
  const found = await db
    .select({
      id: users.id, username: users.username, name: users.name, role: users.role,
      active: users.active, mustChangePassword: users.mustChangePassword,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.id, sid), gt(authSessions.expiresAt, new Date())))
    .limit(1);
  const u = found[0];
  if (!u || !u.active) {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ error: u ? "Usuário desativado" : "Sessão expirada" }, 401);
  }
  const user: SessionUser = { id: u.id, username: u.username, name: u.name, role: u.role as SessionUser["role"], mustChangePassword: u.mustChangePassword };
  c.set("user", user);
  c.set("sessionId", sid);

  let scope = user.id;
  let viewingAs = false;
  const viewAs = c.req.header("x-view-as");
  if (viewAs && user.role === "admin") {
    const target = Number(viewAs);
    if (Number.isInteger(target) && target > 0 && target !== user.id) {
      const exists = await db.select({ id: users.id }).from(users).where(eq(users.id, target)).limit(1);
      if (!exists[0]) return c.json({ error: "Usuário não encontrado" }, 404);
      scope = target;
      viewingAs = true;
    }
  }
  c.set("scopeUserId", scope);
  c.set("viewingAs", viewingAs);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user")?.role !== "admin") return c.json({ error: "Acesso restrito a administradores" }, 403);
  await next();
};

/** Bloqueia ações que só o dono da conta pode executar (ex.: parear o WhatsApp). */
export const ownerOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("viewingAs")) return c.json({ error: "Esta ação só pode ser feita pelo próprio usuário" }, 403);
  await next();
};

/**
 * Proteção CSRF: requisições que alteram dados precisam do cabeçalho customizado X-Requested-With.
 * Navegadores não enviam cabeçalhos customizados entre origens sem preflight CORS (que este
 * servidor não autoriza), então um site de terceiros não consegue forjar essas requisições.
 */
export const sameOrigin: MiddlewareHandler = async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && !c.req.path.startsWith("/api/internal/")) {
    if (c.req.header("x-requested-with") !== "ecoa") return c.json({ error: "Requisição inválida" }, 403);
  }
  await next();
};
