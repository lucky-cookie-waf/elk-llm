-- Need to install the following packages:
-- prisma@6.13.0
-- Ok to proceed? (y) 
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."SessionLabel" AS ENUM ('NORMAL', 'MALICIOUS');

-- CreateTable
CREATE TABLE "public"."RawLog" (
    "id" SERIAL NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "remote_host" TEXT,
    "remote_port" INTEGER,
    "local_host" TEXT,
    "local_port" INTEGER,
    "method" TEXT,
    "uri" TEXT,
    "http_version" TEXT,
    "host" TEXT,
    "user_agent" TEXT,
    "request_headers" JSONB,
    "request_body" TEXT,
    "response_headers" JSONB,
    "response_body" TEXT,
    "matched_rules" JSONB,
    "audit_summary" JSONB,
    "full_log" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" SERIAL NOT NULL,
    "session_id" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "label" "public"."SessionLabel",

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Rule" (
    "id" SERIAL NOT NULL,
    "rule_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rule_name" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "transformation" TEXT,
    "severity_level" TEXT NOT NULL,
    "logdata" TEXT,
    "rule_template" JSONB NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RawLog_transaction_id_key" ON "public"."RawLog"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "Session_session_id_key" ON "public"."Session"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "Rule_rule_id_key" ON "public"."Rule"("rule_id");

