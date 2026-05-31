CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "UserRole" AS ENUM ('marketer', 'client');
CREATE TYPE "DeviceType" AS ENUM ('mobile', 'desktop', 'tablet');
CREATE TYPE "ReportStatus" AS ENUM ('pending', 'processing', 'done', 'failed');
CREATE TYPE "ReportKind" AS ENUM ('manual', 'weekly');
CREATE TYPE "NotificationType" AS ENUM ('report_ready', 'alert_no_clicks', 'weekly_report');

CREATE TABLE "clients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "contact_email" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "role" "UserRole" NOT NULL,
  "client_id" uuid REFERENCES "clients"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "short_code" text NOT NULL UNIQUE CHECK (length("short_code") BETWEEN 5 AND 12),
  "original_url" text NOT NULL,
  "campaign_name" text,
  "client_id" uuid NOT NULL REFERENCES "clients"("id"),
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "active" boolean NOT NULL DEFAULT true,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE TABLE "clicks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "link_id" uuid NOT NULL REFERENCES "links"("id"),
  "event_id" uuid NOT NULL UNIQUE,
  "clicked_at" timestamptz NOT NULL,
  "country" text,
  "city" text,
  "device_type" "DeviceType",
  "browser" text,
  "os" text,
  "referrer" text,
  "ip_hash" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "status" "ReportStatus" NOT NULL,
  "requested_by" uuid NOT NULL REFERENCES "users"("id"),
  "client_id" uuid REFERENCES "clients"("id"),
  "date_from" timestamptz NOT NULL,
  "date_to" timestamptz NOT NULL,
  "link_ids" uuid[] NOT NULL DEFAULT '{}',
  "kind" "ReportKind" NOT NULL,
  "file_path" text,
  "error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);

CREATE TABLE "notification_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" "NotificationType" NOT NULL,
  "recipient_email" text NOT NULL,
  "link_id" uuid REFERENCES "links"("id"),
  "report_id" uuid REFERENCES "reports"("id"),
  "period_key" text NOT NULL,
  "dedupe_key" text NOT NULL UNIQUE,
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "clients_name_idx" ON "clients"("name");
CREATE INDEX "links_created_by_idx" ON "links"("created_by");
CREATE INDEX "links_client_id_idx" ON "links"("client_id");
CREATE INDEX "links_active_expires_at_idx" ON "links"("active", "expires_at");
CREATE INDEX "clicks_link_id_clicked_at_idx" ON "clicks"("link_id", "clicked_at");
CREATE INDEX "clicks_clicked_at_idx" ON "clicks"("clicked_at");
CREATE INDEX "reports_requested_by_created_at_idx" ON "reports"("requested_by", "created_at");
CREATE INDEX "reports_status_idx" ON "reports"("status");
CREATE INDEX "notification_logs_type_link_id_period_key_idx" ON "notification_logs"("type", "link_id", "period_key");
