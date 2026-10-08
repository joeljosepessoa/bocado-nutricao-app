-- Metas do paciente definidas pelo nutricionista (nulas = sem meta) e
-- registros feitos pelo próprio paciente no app: peso, água e fotos de
-- progresso. Só acrescenta colunas/tabelas; nenhum dado existente muda.

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "target_weight_kg" DOUBLE PRECISION,
ADD COLUMN     "water_goal_ml" INTEGER;

-- CreateTable
CREATE TABLE "client_weight_logs" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "weight_kg" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_weight_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_water_logs" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "amount_ml" INTEGER NOT NULL,
    "logged_on" DATE NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_water_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_progress_photos" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "taken_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_progress_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_weight_logs_client_id_recorded_at_idx" ON "client_weight_logs"("client_id", "recorded_at");

-- CreateIndex
CREATE INDEX "client_water_logs_client_id_logged_on_idx" ON "client_water_logs"("client_id", "logged_on");

-- CreateIndex
CREATE INDEX "client_progress_photos_client_id_taken_at_idx" ON "client_progress_photos"("client_id", "taken_at");

-- AddForeignKey
ALTER TABLE "client_weight_logs" ADD CONSTRAINT "client_weight_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_water_logs" ADD CONSTRAINT "client_water_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_progress_photos" ADD CONSTRAINT "client_progress_photos_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

