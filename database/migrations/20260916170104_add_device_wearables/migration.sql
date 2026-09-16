-- CreateEnum
CREATE TYPE "DeviceSourceType" AS ENUM ('ble_direct', 'apple_healthkit', 'android_health_connect', 'manufacturer_api', 'manual_import');

-- CreateEnum
CREATE TYPE "DeviceConnectionStatus" AS ENUM ('active', 'revoked', 'error');

-- CreateEnum
CREATE TYPE "DeviceMetricType" AS ENUM ('heart_rate', 'resting_heart_rate', 'steps', 'distance', 'active_calories', 'sleep_session', 'workout_activity', 'exercise_duration', 'oxygen_saturation', 'body_temperature', 'respiratory_rate');

-- CreateEnum
CREATE TYPE "DeviceAuditAction" AS ENUM ('connection_created', 'connection_revoked', 'share_enabled', 'share_disabled', 'metrics_ingested', 'metrics_viewed_by_professional');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "device_data_consent_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "device_connections" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "source_type" "DeviceSourceType" NOT NULL,
    "driver_id" TEXT,
    "device_identifier" TEXT,
    "external_account_id" TEXT,
    "status" "DeviceConnectionStatus" NOT NULL DEFAULT 'active',
    "shared_with_professional" BOOLEAN NOT NULL DEFAULT false,
    "last_synced_at" TIMESTAMP(3),
    "last_sync_cursor" TEXT,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "device_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_metric_samples" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "device_connection_id" TEXT NOT NULL,
    "metric_type" "DeviceMetricType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3) NOT NULL,
    "precision" DOUBLE PRECISION,
    "external_id" TEXT,
    "dedup_hash" TEXT NOT NULL,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_metric_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_audit_logs" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "professional_id" TEXT,
    "device_connection_id" TEXT,
    "action" "DeviceAuditAction" NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_connections_client_id_status_idx" ON "device_connections"("client_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "device_metric_samples_dedup_hash_key" ON "device_metric_samples"("dedup_hash");

-- CreateIndex
CREATE INDEX "device_metric_samples_client_id_metric_type_started_at_idx" ON "device_metric_samples"("client_id", "metric_type", "started_at");

-- CreateIndex
CREATE INDEX "device_metric_samples_device_connection_id_idx" ON "device_metric_samples"("device_connection_id");

-- CreateIndex
CREATE INDEX "device_audit_logs_client_id_created_at_idx" ON "device_audit_logs"("client_id", "created_at");

-- AddForeignKey
ALTER TABLE "device_connections" ADD CONSTRAINT "device_connections_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_metric_samples" ADD CONSTRAINT "device_metric_samples_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_metric_samples" ADD CONSTRAINT "device_metric_samples_device_connection_id_fkey" FOREIGN KEY ("device_connection_id") REFERENCES "device_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_audit_logs" ADD CONSTRAINT "device_audit_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_audit_logs" ADD CONSTRAINT "device_audit_logs_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_audit_logs" ADD CONSTRAINT "device_audit_logs_device_connection_id_fkey" FOREIGN KEY ("device_connection_id") REFERENCES "device_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
