-- Mídia de exercício (GIF no R2 privado): tabela NOVA, sem tocar em tabelas
-- existentes, sem backfill. N mídias por exercício; FK RESTRICT como o resto do schema.
-- CreateTable
CREATE TABLE "exercise_media" (
    "id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exercise_media_exercise_id_idx" ON "exercise_media"("exercise_id");

-- CreateIndex
CREATE INDEX "exercise_media_storage_key_idx" ON "exercise_media"("storage_key");

-- CreateIndex
CREATE INDEX "exercise_media_sha256_idx" ON "exercise_media"("sha256");

-- AddForeignKey
ALTER TABLE "exercise_media" ADD CONSTRAINT "exercise_media_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
