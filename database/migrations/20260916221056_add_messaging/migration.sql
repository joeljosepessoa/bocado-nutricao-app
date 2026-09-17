-- CreateEnum
CREATE TYPE "MessageSenderRole" AS ENUM ('professional', 'client');

-- CreateEnum
CREATE TYPE "MessageAuditAction" AS ENUM ('thread_created', 'message_sent', 'thread_read');

-- AlterEnum
ALTER TYPE "NotificationEventType" ADD VALUE 'message_received';

-- CreateTable
CREATE TABLE "message_threads" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "sender_role" "MessageSenderRole" NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_audit_logs" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "message_id" TEXT,
    "action" "MessageAuditAction" NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_threads_client_id_professional_id_key" ON "message_threads"("client_id", "professional_id");

-- CreateIndex
CREATE INDEX "messages_thread_id_created_at_idx" ON "messages"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "message_audit_logs_thread_id_idx" ON "message_audit_logs"("thread_id");

-- CreateIndex
CREATE INDEX "message_audit_logs_professional_id_created_at_idx" ON "message_audit_logs"("professional_id", "created_at");

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_audit_logs" ADD CONSTRAINT "message_audit_logs_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_audit_logs" ADD CONSTRAINT "message_audit_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_audit_logs" ADD CONSTRAINT "message_audit_logs_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
