-- CreateTable
CREATE TABLE "custom_forms" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "questions" JSONB NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_form_responses" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "form_name" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "answers" JSONB NOT NULL,
    "filled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_form_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_forms_professional_id_deleted_at_idx" ON "custom_forms"("professional_id", "deleted_at");

-- CreateIndex
CREATE INDEX "custom_form_responses_client_id_filled_at_idx" ON "custom_form_responses"("client_id", "filled_at");

-- CreateIndex
CREATE INDEX "custom_form_responses_form_id_idx" ON "custom_form_responses"("form_id");

-- AddForeignKey
ALTER TABLE "custom_forms" ADD CONSTRAINT "custom_forms_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_form_responses" ADD CONSTRAINT "custom_form_responses_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "custom_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_form_responses" ADD CONSTRAINT "custom_form_responses_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_form_responses" ADD CONSTRAINT "custom_form_responses_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
