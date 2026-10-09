-- Autorização do paciente para o nutricionista ver as fotos de progresso.
-- Só acrescenta uma coluna opcional; nenhum dado existente muda.

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "progress_photos_shared_at" TIMESTAMP(3);

