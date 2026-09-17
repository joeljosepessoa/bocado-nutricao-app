-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('one_time', 'recurring');

-- CreateEnum
CREATE TYPE "RecurrenceInterval" AS ENUM ('month', 'year');

-- CreateEnum
CREATE TYPE "PaymentLinkStatus" AS ENUM ('created', 'paid', 'converted', 'expired', 'canceled');

-- CreateEnum
CREATE TYPE "ClientSubscriptionStatus" AS ENUM ('pending', 'authorized', 'paused', 'cancelled');

-- CreateEnum
CREATE TYPE "ClientInvoiceStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "ClientBillingAuditAction" AS ENUM ('link_created', 'payment_approved', 'payment_failed', 'subscription_authorized', 'subscription_paused', 'subscription_canceled', 'webhook_received', 'webhook_rejected');

-- CreateTable
CREATE TABLE "professional_products" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_cents" INTEGER NOT NULL,
    "billing_type" "BillingType" NOT NULL,
    "recurrence_interval" "RecurrenceInterval",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professional_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_links" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "professional_product_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "payment_type" "BillingType" NOT NULL,
    "status" "PaymentLinkStatus" NOT NULL DEFAULT 'created',
    "checkout_url" TEXT,
    "external_preference_id" TEXT,
    "external_subscription_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_subscriptions" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "professional_product_id" TEXT NOT NULL,
    "payment_link_id" TEXT,
    "status" "ClientSubscriptionStatus" NOT NULL DEFAULT 'pending',
    "external_subscription_id" TEXT NOT NULL,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_invoices" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "payment_link_id" TEXT,
    "client_subscription_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "status" "ClientInvoiceStatus" NOT NULL DEFAULT 'pending',
    "external_payment_id" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_billing_audit_logs" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "payment_link_id" TEXT,
    "client_subscription_id" TEXT,
    "action" "ClientBillingAuditAction" NOT NULL,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_billing_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "professional_products_professional_id_idx" ON "professional_products"("professional_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_links_external_preference_id_key" ON "payment_links"("external_preference_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_links_external_subscription_id_key" ON "payment_links"("external_subscription_id");

-- CreateIndex
CREATE INDEX "payment_links_professional_id_idx" ON "payment_links"("professional_id");

-- CreateIndex
CREATE INDEX "payment_links_client_id_idx" ON "payment_links"("client_id");

-- CreateIndex
CREATE INDEX "payment_links_professional_product_id_idx" ON "payment_links"("professional_product_id");

-- CreateIndex
CREATE INDEX "payment_links_status_idx" ON "payment_links"("status");

-- CreateIndex
CREATE UNIQUE INDEX "client_subscriptions_payment_link_id_key" ON "client_subscriptions"("payment_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_subscriptions_external_subscription_id_key" ON "client_subscriptions"("external_subscription_id");

-- CreateIndex
CREATE INDEX "client_subscriptions_professional_id_idx" ON "client_subscriptions"("professional_id");

-- CreateIndex
CREATE INDEX "client_subscriptions_client_id_idx" ON "client_subscriptions"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_invoices_external_payment_id_key" ON "client_invoices"("external_payment_id");

-- CreateIndex
CREATE INDEX "client_invoices_professional_id_idx" ON "client_invoices"("professional_id");

-- CreateIndex
CREATE INDEX "client_invoices_client_id_idx" ON "client_invoices"("client_id");

-- CreateIndex
CREATE INDEX "client_invoices_payment_link_id_idx" ON "client_invoices"("payment_link_id");

-- CreateIndex
CREATE INDEX "client_invoices_client_subscription_id_idx" ON "client_invoices"("client_subscription_id");

-- CreateIndex
CREATE INDEX "client_billing_audit_logs_professional_id_created_at_idx" ON "client_billing_audit_logs"("professional_id", "created_at");

-- AddForeignKey
ALTER TABLE "professional_products" ADD CONSTRAINT "professional_products_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_professional_product_id_fkey" FOREIGN KEY ("professional_product_id") REFERENCES "professional_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_subscriptions" ADD CONSTRAINT "client_subscriptions_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_subscriptions" ADD CONSTRAINT "client_subscriptions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_subscriptions" ADD CONSTRAINT "client_subscriptions_payment_link_id_fkey" FOREIGN KEY ("payment_link_id") REFERENCES "payment_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_payment_link_id_fkey" FOREIGN KEY ("payment_link_id") REFERENCES "payment_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_client_subscription_id_fkey" FOREIGN KEY ("client_subscription_id") REFERENCES "client_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_billing_audit_logs" ADD CONSTRAINT "client_billing_audit_logs_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_billing_audit_logs" ADD CONSTRAINT "client_billing_audit_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_billing_audit_logs" ADD CONSTRAINT "client_billing_audit_logs_payment_link_id_fkey" FOREIGN KEY ("payment_link_id") REFERENCES "payment_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_billing_audit_logs" ADD CONSTRAINT "client_billing_audit_logs_client_subscription_id_fkey" FOREIGN KEY ("client_subscription_id") REFERENCES "client_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
