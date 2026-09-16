-- CreateEnum
CREATE TYPE "DeviceTokenPlatform" AS ENUM ('ios', 'android');

-- CreateEnum
CREATE TYPE "NotificationEventType" AS ENUM ('report_ready', 'evaluation_released', 'diet_published', 'workout_published');

-- CreateEnum
CREATE TYPE "NotificationLogStatus" AS ENUM ('sent', 'failed', 'skipped_preference');

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "client_id" TEXT,
    "professional_id" TEXT,
    "platform" "DeviceTokenPlatform" NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "client_id" TEXT,
    "professional_id" TEXT,
    "event_type" "NotificationEventType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "client_id" TEXT,
    "professional_id" TEXT,
    "event_type" "NotificationEventType" NOT NULL,
    "status" "NotificationLogStatus" NOT NULL,
    "device_token_id" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_client_id_revoked_at_idx" ON "device_tokens"("client_id", "revoked_at");

-- CreateIndex
CREATE INDEX "device_tokens_professional_id_revoked_at_idx" ON "device_tokens"("professional_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_client_id_event_type_key" ON "notification_preferences"("client_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_professional_id_event_type_key" ON "notification_preferences"("professional_id", "event_type");

-- CreateIndex
CREATE INDEX "notification_logs_client_id_created_at_idx" ON "notification_logs"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_logs_professional_id_created_at_idx" ON "notification_logs"("professional_id", "created_at");

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_device_token_id_fkey" FOREIGN KEY ("device_token_id") REFERENCES "device_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
