import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { requireAuth, requireAdmin, sameOrigin, type AppEnv } from "../../server/lib/auth.js";
import { ensureBootstrap, getWorkerToken } from "../../server/lib/store.js";
import { authRoutes } from "../../server/routes/auth.js";
import { whatsappRoutes } from "../../server/routes/whatsapp.js";
import { contactRoutes, groupRoutes, settingsRoutes } from "../../server/routes/contacts.js";
import { campaignRoutes, dashboardRoutes } from "../../server/routes/campaigns.js";
import { adminRoutes } from "../../server/routes/admin.js";
import { tick } from "../../server/worker.js";

const app = new Hono<AppEnv>();

app.use("/api/*", async (c, next) => {
  await ensureBootstrap();
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  await next();
});
app.use("/api/*", sameOrigin);

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", authRoutes);

/** Chamado pela função agendada `campaign-tick` (a cada minuto) para retomar filas de envio. */
app.post("/api/internal/tick", async (c) => {
  const expected = await getWorkerToken();
  const given = c.req.header("x-worker-token") ?? "";
  if (!expected || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return c.json({ error: "Não autorizado" }, 401);
  }
  const users = await tick();
  return c.json({ ok: true, users });
});

const authed = new Hono<AppEnv>();
authed.use("*", requireAuth);
authed.route("/whatsapp", whatsappRoutes);
authed.route("/contacts", contactRoutes);
authed.route("/groups", groupRoutes);
authed.route("/settings", settingsRoutes);
authed.route("/campaigns", campaignRoutes);
authed.route("/dashboard", dashboardRoutes);
authed.use("/admin/*", requireAdmin);
authed.route("/admin", adminRoutes);
app.route("/api", authed);

app.notFound((c) => c.json({ error: "Rota não encontrada" }, 404));
app.onError((err, c) => {
  console.error("[api]", c.req.method, c.req.path, err);
  return c.json({ error: "Erro interno no servidor. Tente novamente." }, 500);
});

export const config = { path: "/api/*" };

export default app;
