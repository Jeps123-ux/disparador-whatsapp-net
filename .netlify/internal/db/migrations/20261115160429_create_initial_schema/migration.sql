CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY,
	"user_id" integer,
	"actor_id" integer,
	"action" text NOT NULL,
	"details" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_recipients" (
	"id" serial PRIMARY KEY,
	"campaign_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"jid" text NOT NULL,
	"name" text,
	"phone" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"wa_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"created_by" integer,
	"name" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"media_key" text,
	"media_type" text,
	"media_name" text,
	"media_mime" text,
	"fallback_name" text DEFAULT '' NOT NULL,
	"append_opt_out" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"min_delay_sec" integer DEFAULT 8 NOT NULL,
	"max_delay_sec" integer DEFAULT 20 NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"last_error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"jid" text NOT NULL,
	"phone" text,
	"name" text,
	"notify" text,
	"img_url" text,
	"source" text DEFAULT 'whatsapp' NOT NULL,
	"opted_out" boolean DEFAULT false NOT NULL,
	"opted_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" integer PRIMARY KEY,
	"min_delay_sec" integer DEFAULT 8 NOT NULL,
	"max_delay_sec" integer DEFAULT 20 NOT NULL,
	"daily_limit" integer DEFAULT 300 NOT NULL,
	"batch_size" integer DEFAULT 25 NOT NULL,
	"batch_pause_sec" integer DEFAULT 120 NOT NULL,
	"opt_out_keywords" text DEFAULT 'SAIR,PARAR,STOP,CANCELAR,DESCADASTRAR' NOT NULL,
	"opt_out_footer" text DEFAULT 'Responda SAIR para não receber mais mensagens.' NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"username" text NOT NULL UNIQUE,
	"name" text DEFAULT '' NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_auth_keys" (
	"user_id" integer,
	"type" text,
	"key_id" text,
	"value_enc" text NOT NULL,
	CONSTRAINT "wa_auth_keys_pkey" PRIMARY KEY("user_id","type","key_id")
);
--> statement-breakpoint
CREATE TABLE "wa_connections" (
	"user_id" integer PRIMARY KEY,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"method" text,
	"phone" text,
	"push_name" text,
	"profile_pic_url" text,
	"qr" text,
	"pairing_code" text,
	"pairing_phone" text,
	"pairing_expires_at" timestamp with time zone,
	"creds_enc" text,
	"registered" boolean DEFAULT false NOT NULL,
	"last_error" text,
	"syncing" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_connected_at" timestamp with time zone,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_groups" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"jid" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"size" integer,
	"img_url" text,
	"announce" boolean DEFAULT false NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "activity_user_idx" ON "activity_logs" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_action_idx" ON "activity_logs" ("action","created_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "recipients_campaign_status_idx" ON "campaign_recipients" ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "recipients_user_sent_idx" ON "campaign_recipients" ("user_id","sent_at");--> statement-breakpoint
CREATE INDEX "recipients_msg_idx" ON "campaign_recipients" ("wa_message_id");--> statement-breakpoint
CREATE INDEX "campaigns_user_idx" ON "campaigns" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "campaigns" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_user_jid_uq" ON "contacts" ("user_id","jid");--> statement-breakpoint
CREATE INDEX "contacts_user_phone_idx" ON "contacts" ("user_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_groups_user_jid_uq" ON "wa_groups" ("user_id","jid");--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_campaigns_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "wa_auth_keys" ADD CONSTRAINT "wa_auth_keys_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "wa_connections" ADD CONSTRAINT "wa_connections_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "wa_groups" ADD CONSTRAINT "wa_groups_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;