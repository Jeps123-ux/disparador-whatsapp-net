import {
  pgTable, serial, text, timestamp, integer, boolean, jsonb, primaryKey, uniqueIndex, index,
} from "drizzle-orm/pg-core";

/** Contas de acesso ao painel. Senhas sempre em hash scrypt. */
export const users = pgTable("users", {
  id: serial().primaryKey(),
  username: text().notNull().unique(),
  name: text().notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  role: text().notNull().default("user"), // 'admin' | 'user'
  active: boolean().notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Sessões de login (token opaco; só o SHA-256 fica salvo). */
export const authSessions = pgTable("auth_sessions", {
  id: text().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ip: text(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("auth_sessions_user_idx").on(t.userId)]);

/** Estado da conexão WhatsApp de cada usuário (1:1). As credenciais ficam criptografadas. */
export const waConnections = pgTable("wa_connections", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  status: text().notNull().default("disconnected"), // disconnected | connecting | qr | pairing | connected | logged_out
  method: text(), // qr | code
  phone: text(),
  pushName: text("push_name"),
  profilePicUrl: text("profile_pic_url"),
  qr: text(),
  pairingCode: text("pairing_code"),
  pairingPhone: text("pairing_phone"),
  pairingExpiresAt: timestamp("pairing_expires_at", { withTimezone: true }),
  credsEnc: text("creds_enc"),
  registered: boolean().notNull().default(false),
  lastError: text("last_error"),
  syncing: boolean().notNull().default(false),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
  leaseOwner: text("lease_owner"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Chaves de sinal (Signal protocol) da sessão WhatsApp, criptografadas. */
export const waAuthKeys = pgTable("wa_auth_keys", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text().notNull(),
  keyId: text("key_id").notNull(),
  valueEnc: text("value_enc").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.type, t.keyId] })]);

export const contacts = pgTable("contacts", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jid: text().notNull(),
  phone: text(),
  name: text(),
  notify: text(),
  imgUrl: text("img_url"),
  source: text().notNull().default("whatsapp"), // whatsapp | manual
  optedOut: boolean("opted_out").notNull().default(false),
  optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("contacts_user_jid_uq").on(t.userId, t.jid), index("contacts_user_phone_idx").on(t.userId, t.phone)]);

export const waGroups = pgTable("wa_groups", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jid: text().notNull(),
  subject: text().notNull().default(""),
  size: integer(),
  imgUrl: text("img_url"),
  announce: boolean().notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("wa_groups_user_jid_uq").on(t.userId, t.jid)]);

export const campaigns = pgTable("campaigns", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdBy: integer("created_by"),
  name: text().notNull(),
  message: text().notNull().default(""),
  mediaKey: text("media_key"),
  mediaType: text("media_type"), // image | video | document
  mediaName: text("media_name"),
  mediaMime: text("media_mime"),
  fallbackName: text("fallback_name").notNull().default(""),
  appendOptOut: boolean("append_opt_out").notNull().default(true),
  status: text().notNull().default("running"), // running | paused | completed | cancelled | failed
  totalRecipients: integer("total_recipients").notNull().default(0),
  minDelaySec: integer("min_delay_sec").notNull().default(8),
  maxDelaySec: integer("max_delay_sec").notNull().default(20),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
  leaseOwner: text("lease_owner"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  lastError: text("last_error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("campaigns_user_idx").on(t.userId, t.createdAt), index("campaigns_status_idx").on(t.status)]);

export const campaignRecipients = pgTable("campaign_recipients", {
  id: serial().primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text().notNull(), // contact | group
  jid: text().notNull(),
  name: text(),
  phone: text(),
  status: text().notNull().default("pending"), // pending | sending | sent | delivered | read | failed | skipped
  waMessageId: text("wa_message_id"),
  error: text(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("recipients_campaign_status_idx").on(t.campaignId, t.status),
  index("recipients_user_sent_idx").on(t.userId, t.sentAt),
  index("recipients_msg_idx").on(t.waMessageId),
]);

export const userSettings = pgTable("user_settings", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  minDelaySec: integer("min_delay_sec").notNull().default(8),
  maxDelaySec: integer("max_delay_sec").notNull().default(20),
  dailyLimit: integer("daily_limit").notNull().default(300),
  batchSize: integer("batch_size").notNull().default(25),
  batchPauseSec: integer("batch_pause_sec").notNull().default(120),
  optOutKeywords: text("opt_out_keywords").notNull().default("SAIR,PARAR,STOP,CANCELAR,DESCADASTRAR"),
  optOutFooter: text("opt_out_footer").notNull().default("Responda SAIR para não receber mais mensagens."),
  timezone: text().notNull().default("America/Sao_Paulo"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityLogs = pgTable("activity_logs", {
  id: serial().primaryKey(),
  userId: integer("user_id"),
  actorId: integer("actor_id"),
  action: text().notNull(),
  details: jsonb(),
  ip: text(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("activity_user_idx").on(t.userId, t.createdAt), index("activity_action_idx").on(t.action, t.createdAt)]);

/** Configurações internas (ex.: token do worker agendado). */
export const appSettings = pgTable("app_settings", {
  key: text().primaryKey(),
  value: text().notNull(),
});
