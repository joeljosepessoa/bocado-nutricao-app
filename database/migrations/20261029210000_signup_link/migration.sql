-- Link de cadastro do paciente: código do link no profissional (null = desligado)
-- e a data em que o paciente se cadastrou sozinho pelo link.
ALTER TABLE "professionals" ADD COLUMN "signup_code" TEXT;
CREATE UNIQUE INDEX "professionals_signup_code_key" ON "professionals"("signup_code");

ALTER TABLE "clients" ADD COLUMN "self_registered_at" TIMESTAMP(3);
