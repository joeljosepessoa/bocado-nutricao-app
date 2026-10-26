-- CreateEnum
CREATE TYPE "LegalConsentStatus" AS ENUM ('accepted', 'legacy');

-- CreateTable
CREATE TABLE "legal_consents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "terms_version" TEXT NOT NULL,
    "privacy_version" TEXT NOT NULL,
    "status" "LegalConsentStatus" NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "app_version" TEXT,
    "platform" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_consents_user_id_accepted_at_idx" ON "legal_consents"("user_id", "accepted_at");

-- AddForeignKey
ALTER TABLE "legal_consents" ADD CONSTRAINT "legal_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserva os aceites antigos (tela "Privacidade dos seus dados") como histórico.
-- Ficam com status 'legacy' e versão '0': NÃO contam como aceite dos Termos 1.0 /
-- Política 1.0 — quem já usa o app aceita as versões novas uma vez, na atualização.
-- users.privacy_accepted_at continua como está (nada é apagado ou alterado).
INSERT INTO "legal_consents" ("id", "user_id", "terms_version", "privacy_version", "status", "accepted_at", "source", "created_at")
SELECT gen_random_uuid()::text, u."id", '0', '0', 'legacy', u."privacy_accepted_at", 'legacy_privacy_screen', CURRENT_TIMESTAMP
FROM "users" u
WHERE u."privacy_accepted_at" IS NOT NULL;
