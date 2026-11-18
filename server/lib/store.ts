import { sql, eq, count } from "drizzle-orm";
import { db, users, appSettings, activityLogs, userSettings } from "../../db/index.js";
import { randomToken } from "./crypto.js";

/** Normaliza o resultado de db.execute entre drivers (neon-http / node-postgres). */
export function rows<T = any>(res: any): T[] {
  if (Array.isArray(res)) return res as T[];
  return (res?.rows ?? []) as T[];
}

/** Hash scrypt da senha inicial do administrador (a senha em texto puro nunca é armazenada). */
const INITIAL_ADMIN_USERNAME = "enrico";
const INITIAL_ADMIN_HASH = "scrypt$16384$8$1$ay257QzrswHaDpf/lMGPrg==$LObEQRQC4uE9s26d4L9JeJFBHc7VfXNeQxFX1gJ686cfPvlxBC5ZdlX4rrrplbBWYn+RwBKtqFGr7pNbQT19lw==";

let bootstrapPromise: Promise<void> | null = null;

/** Cria o administrador inicial e o token interno do worker na primeira inicialização. */
export function ensureBootstrap(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const [{ value: total }] = await db.select({ value: count() }).from(users);
      if (Number(total) === 0) {
        const inserted = await db
          .insert(users)
          .values({ username: INITIAL_ADMIN_USERNAME, name: "Enrico", passwordHash: INITIAL_ADMIN_HASH, role: "admin" })
          .onConflictDoNothing()
          .returning({ id: users.id });
        if (inserted[0]) {
          await db.insert(userSettings).values({ userId: inserted[0].id }).onConflictDoNothing();
          await db.insert(activityLogs).values({ userId: inserted[0].id, action: "system.bootstrap_admin", details: { username: INITIAL_ADMIN_USERNAME } });
        }
      }
      await db.insert(appSettings).values({ key: "worker_token", value: randomToken(32) }).onConflictDoNothing();
    })().catch((e) => {
      bootstrapPromise = null;
      throw e;
    });
  }
  return bootstrapPromise;
}

export async function getWorkerToken(): Promise<string | null> {
  const r = await db.select().from(appSettings).where(eq(appSettings.key, "worker_token"));
  return r[0]?.value ?? null;
}

export async function logActivity(entry: { userId?: number | null; actorId?: number | null; action: string; details?: unknown; ip?: string | null }) {
  try {
    await db.insert(activityLogs).values({
      userId: entry.userId ?? null,
      actorId: entry.actorId ?? null,
      action: entry.action,
      details: (entry.details ?? null) as any,
      ip: entry.ip ?? null,
    });
  } catch (e) {
    console.error("[activity-log] falha ao registrar", entry.action, e);
  }
}

export async function getSettings(userId: number) {
  await db.insert(userSettings).values({ userId }).onConflictDoNothing();
  const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return s;
}

export { sql };
