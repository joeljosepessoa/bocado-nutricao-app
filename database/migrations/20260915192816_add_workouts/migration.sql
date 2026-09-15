-- CreateEnum
CREATE TYPE "ExerciseType" AS ENUM ('strength', 'cardio', 'mobility', 'stretching', 'bodyweight', 'other');

-- CreateEnum
CREATE TYPE "ExerciseScope" AS ENUM ('global', 'private');

-- CreateEnum
CREATE TYPE "LoadUnit" AS ENUM ('kg', 'lb', 'bodyweight', 'band_level', 'other');

-- CreateEnum
CREATE TYPE "WorkoutStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "WorkoutVersionStatus" AS ENUM ('draft', 'published', 'superseded');

-- CreateEnum
CREATE TYPE "WorkoutAuditAction" AS ENUM ('created', 'updated', 'version_created', 'version_updated', 'published', 'archived', 'day_added', 'day_updated', 'day_removed', 'exercise_added', 'exercise_updated', 'exercise_removed', 'set_added', 'set_updated', 'set_removed', 'execution_logged', 'read', 'listed', 'compared');

-- CreateTable
CREATE TABLE "exercises" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "muscle_group" TEXT,
    "equipment" TEXT,
    "instructions" TEXT,
    "type" "ExerciseType" NOT NULL,
    "scope" "ExerciseScope" NOT NULL DEFAULT 'global',
    "owner_professional_id" TEXT,
    "video_url" TEXT,
    "image_url" TEXT,
    "created_by_professional_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workouts" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "status" "WorkoutStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_versions" (
    "id" TEXT NOT NULL,
    "workout_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "WorkoutVersionStatus" NOT NULL DEFAULT 'draft',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "objective" TEXT,
    "notes" TEXT,
    "created_by_professional_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "superseded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_days" (
    "id" TEXT NOT NULL,
    "workout_version_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "workout_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_exercises" (
    "id" TEXT NOT NULL,
    "workout_day_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "workout_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_sets" (
    "id" TEXT NOT NULL,
    "workout_exercise_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "reps" INTEGER,
    "load_value" DOUBLE PRECISION,
    "load_unit" "LoadUnit",
    "duration_seconds" INTEGER,
    "distance_meters" DOUBLE PRECISION,
    "rest_seconds" INTEGER,
    "tempo" TEXT,
    "notes" TEXT,

    CONSTRAINT "workout_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_execution_logs" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "workout_day_id" TEXT NOT NULL,
    "workout_version_id" TEXT NOT NULL,
    "logged_by_professional_id" TEXT,
    "performed_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_execution_sets" (
    "id" TEXT NOT NULL,
    "execution_log_id" TEXT NOT NULL,
    "workout_exercise_id" TEXT NOT NULL,
    "set_order" INTEGER NOT NULL,
    "reps_performed" INTEGER,
    "load_value" DOUBLE PRECISION,
    "load_unit" "LoadUnit",
    "duration_seconds" INTEGER,
    "distance_meters" DOUBLE PRECISION,
    "perceived_effort" INTEGER,
    "notes" TEXT,

    CONSTRAINT "workout_execution_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_audit_logs" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "workout_id" TEXT NOT NULL,
    "workout_version_id" TEXT,
    "action" "WorkoutAuditAction" NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exercises_name_idx" ON "exercises"("name");

-- CreateIndex
CREATE INDEX "exercises_scope_owner_professional_id_idx" ON "exercises"("scope", "owner_professional_id");

-- CreateIndex
CREATE INDEX "workouts_client_id_idx" ON "workouts"("client_id");

-- CreateIndex
CREATE INDEX "workouts_professional_id_idx" ON "workouts"("professional_id");

-- CreateIndex
CREATE INDEX "workout_versions_workout_id_status_idx" ON "workout_versions"("workout_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workout_versions_workout_id_version_number_key" ON "workout_versions"("workout_id", "version_number");

-- CreateIndex
CREATE INDEX "workout_days_workout_version_id_order_idx" ON "workout_days"("workout_version_id", "order");

-- CreateIndex
CREATE INDEX "workout_exercises_workout_day_id_order_idx" ON "workout_exercises"("workout_day_id", "order");

-- CreateIndex
CREATE INDEX "workout_sets_workout_exercise_id_order_idx" ON "workout_sets"("workout_exercise_id", "order");

-- CreateIndex
CREATE INDEX "workout_execution_logs_client_id_performed_at_idx" ON "workout_execution_logs"("client_id", "performed_at");

-- CreateIndex
CREATE INDEX "workout_execution_logs_workout_day_id_idx" ON "workout_execution_logs"("workout_day_id");

-- CreateIndex
CREATE INDEX "workout_execution_sets_execution_log_id_idx" ON "workout_execution_sets"("execution_log_id");

-- CreateIndex
CREATE INDEX "workout_audit_logs_workout_id_created_at_idx" ON "workout_audit_logs"("workout_id", "created_at");

-- CreateIndex
CREATE INDEX "workout_audit_logs_professional_id_created_at_idx" ON "workout_audit_logs"("professional_id", "created_at");

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_owner_professional_id_fkey" FOREIGN KEY ("owner_professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_created_by_professional_id_fkey" FOREIGN KEY ("created_by_professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_versions" ADD CONSTRAINT "workout_versions_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_days" ADD CONSTRAINT "workout_days_workout_version_id_fkey" FOREIGN KEY ("workout_version_id") REFERENCES "workout_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_workout_day_id_fkey" FOREIGN KEY ("workout_day_id") REFERENCES "workout_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_workout_exercise_id_fkey" FOREIGN KEY ("workout_exercise_id") REFERENCES "workout_exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_execution_logs" ADD CONSTRAINT "workout_execution_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_execution_logs" ADD CONSTRAINT "workout_execution_logs_workout_day_id_fkey" FOREIGN KEY ("workout_day_id") REFERENCES "workout_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_execution_logs" ADD CONSTRAINT "workout_execution_logs_workout_version_id_fkey" FOREIGN KEY ("workout_version_id") REFERENCES "workout_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_execution_logs" ADD CONSTRAINT "workout_execution_logs_logged_by_professional_id_fkey" FOREIGN KEY ("logged_by_professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_execution_sets" ADD CONSTRAINT "workout_execution_sets_execution_log_id_fkey" FOREIGN KEY ("execution_log_id") REFERENCES "workout_execution_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_execution_sets" ADD CONSTRAINT "workout_execution_sets_workout_exercise_id_fkey" FOREIGN KEY ("workout_exercise_id") REFERENCES "workout_exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_audit_logs" ADD CONSTRAINT "workout_audit_logs_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_audit_logs" ADD CONSTRAINT "workout_audit_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_audit_logs" ADD CONSTRAINT "workout_audit_logs_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_audit_logs" ADD CONSTRAINT "workout_audit_logs_workout_version_id_fkey" FOREIGN KEY ("workout_version_id") REFERENCES "workout_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
