import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, waConnections } from "../../db/index.js";
import { ownerOnly, type AppEnv } from "../lib/auth.js";
import { logActivity } from "../lib/store.js";
import { startPairing, cancelPairing, ensureConnected, disconnect, requestSync, isLive, WaError } from "../wa/manager.js";

export const whatsappRoutes = new Hono<AppEnv>();

function waErrorResponse(e: unknown) {
  if (e instanceof WaError) {
    const status = e.code === "BUSY" ? 409 : e.code === "TIMEOUT" ? 504 : e.code === "NOT_CONNECTED" || e.code === "LOGGED_OUT" ? 412 : 502;
    return { body: { error: e.message, code: e.code }, status } as const;
  }
  console.error("[whatsapp]", e);
  return { body: { error: (e as any)?.message ?? "Erro inesperado na integração" }, status: 500 } as const;
}

async function publicStatus(userId: number, hideSecrets: boolean) {
  const [row] = await db.select().from(waConnections).where(eq(waConnections.userId, userId));
  const pairingActive = row?.pairingExpiresAt ? new Date(row.pairingExpiresAt).getTime() > Date.now() : false;
  return {
    status: row?.status ?? "disconnected",
    connected: !!row?.registered && row?.status === "connected",
    method: row?.method ?? null,
    phone: row?.phone ?? null,
    pushName: row?.pushName ?? null,
    profilePicUrl: row?.profilePicUrl ?? null,
    // QR Code e código de pareamento são credenciais: só o dono da conta os vê.
    qr: !hideSecrets && pairingActive && row?.status === "qr" ? row.qr : null,
    pairingCode: !hideSecrets && pairingActive && row?.status === "pairing" ? row.pairingCode : null,
    pairingExpiresAt: row?.pairingExpiresAt ?? null,
    lastError: row?.lastError ?? null,
    syncing: !!row?.syncing,
    lastSyncAt: row?.lastSyncAt ?? null,
    lastConnectedAt: row?.lastConnectedAt ?? null,
    live: isLive(userId),
  };
}

whatsappRoutes.get("/status", async (c) => c.json(await publicStatus(c.get("scopeUserId"), c.get("viewingAs"))));

whatsappRoutes.post("/connect", ownerOnly, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const method = body.method === "code" ? "code" : "qr";
  let phone: string | undefined;
  if (method === "code") {
    phone = String(body.phone ?? "").replace(/\D/g, "");
    if (phone.length < 10 || phone.length > 15) return c.json({ error: "Informe o número completo com DDI e DDD (ex.: 5511987654321)" }, 400);
  }
  try {
    await startPairing(user.id, method, phone);
    await logActivity({ userId: user.id, actorId: user.id, action: "whatsapp.pairing_started", details: { method } });
    return c.json(await publicStatus(user.id, false));
  } catch (e) {
    const r = waErrorResponse(e);
    return c.json(r.body, r.status);
  }
});

whatsappRoutes.post("/cancel", ownerOnly, async (c) => {
  await cancelPairing(c.get("user").id);
  return c.json(await publicStatus(c.get("user").id, false));
});

/** Testa/restabelece a conexão usando a sessão salva (sem novo pareamento). */
whatsappRoutes.post("/reconnect", async (c) => {
  const scope = c.get("scopeUserId");
  try {
    await ensureConnected(scope, 45_000);
    await logActivity({ userId: scope, actorId: c.get("user").id, action: "whatsapp.reconnected" });
    return c.json(await publicStatus(scope, c.get("viewingAs")));
  } catch (e) {
    const r = waErrorResponse(e);
    return c.json(r.body, r.status);
  }
});

whatsappRoutes.post("/sync", async (c) => {
  const scope = c.get("scopeUserId");
  try {
    await requestSync(scope);
    await logActivity({ userId: scope, actorId: c.get("user").id, action: "whatsapp.sync_requested" });
    return c.json(await publicStatus(scope, c.get("viewingAs")));
  } catch (e) {
    const r = waErrorResponse(e);
    return c.json(r.body, r.status);
  }
});

whatsappRoutes.post("/disconnect", async (c) => {
  const scope = c.get("scopeUserId");
  await disconnect(scope, { logout: true });
  await logActivity({ userId: scope, actorId: c.get("user").id, action: "whatsapp.disconnected" });
  return c.json(await publicStatus(scope, c.get("viewingAs")));
});
