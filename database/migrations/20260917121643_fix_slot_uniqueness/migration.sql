-- DropIndex
DROP INDEX "appointments_slot_id_key";

-- CreateIndex
CREATE INDEX "appointments_slot_id_idx" ON "appointments"("slot_id");

-- Índice único PARCIAL (Prisma não expressa isso declarativamente): no
-- máximo uma consulta ATIVA (não cancelada) por slot, garantido no banco,
-- sem bloquear o slot para sempre depois de um cancelamento — o histórico
-- de consultas canceladas continua existindo e reutiliza o mesmo slot_id.
CREATE UNIQUE INDEX "appointments_active_slot_unique" ON "appointments"("slot_id") WHERE "status" != 'cancelled';
