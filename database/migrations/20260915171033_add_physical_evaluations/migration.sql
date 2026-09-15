-- CreateEnum
CREATE TYPE "EvaluationBiologicalSex" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "BodyFatSource" AS ENUM ('skinfolds', 'bioimpedance', 'manual');

-- CreateEnum
CREATE TYPE "BioimpedanceOrigin" AS ENUM ('manual', 'device_confirmed');

-- CreateEnum
CREATE TYPE "PhotoAngle" AS ENUM ('front', 'side_right', 'back', 'side_left');

-- CreateEnum
CREATE TYPE "EvaluationAuditAction" AS ENUM ('created', 'read', 'updated', 'listed', 'compared', 'photo_uploaded', 'photo_read', 'photo_deleted');

-- CreateTable
CREATE TABLE "protocols" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "required_skinfold_sites" TEXT[],
    "sex_specific" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL,
    "superseded_by_protocol_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_evaluations" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL,
    "age_at_evaluation" INTEGER,
    "biological_sex_for_calculation" "EvaluationBiologicalSex",
    "height_cm" DOUBLE PRECISION NOT NULL,
    "weight_kg" DOUBLE PRECISION,
    "protocol_id" TEXT,
    "blood_pressure_systolic" INTEGER,
    "blood_pressure_diastolic" INTEGER,
    "heart_rate" INTEGER,
    "glucose" DOUBLE PRECISION,
    "notes" TEXT,
    "released_to_client_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "physical_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurements" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "chest_cm" DOUBLE PRECISION,
    "waist_cm" DOUBLE PRECISION,
    "abdomen_cm" DOUBLE PRECISION,
    "hip_cm" DOUBLE PRECISION,
    "arm_right_cm" DOUBLE PRECISION,
    "arm_left_cm" DOUBLE PRECISION,
    "forearm_right_cm" DOUBLE PRECISION,
    "forearm_left_cm" DOUBLE PRECISION,
    "thigh_right_cm" DOUBLE PRECISION,
    "thigh_left_cm" DOUBLE PRECISION,
    "calf_right_cm" DOUBLE PRECISION,
    "calf_left_cm" DOUBLE PRECISION,
    "wrist_cm" DOUBLE PRECISION,
    "femur_bicondylar_cm" DOUBLE PRECISION,

    CONSTRAINT "measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skinfolds" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "chest_mm" DOUBLE PRECISION,
    "axillary_mid_mm" DOUBLE PRECISION,
    "subscapular_mm" DOUBLE PRECISION,
    "biceps_mm" DOUBLE PRECISION,
    "triceps_mm" DOUBLE PRECISION,
    "abdominal_mm" DOUBLE PRECISION,
    "suprailiac_mm" DOUBLE PRECISION,
    "thigh_mm" DOUBLE PRECISION,
    "calf_mm" DOUBLE PRECISION,

    CONSTRAINT "skinfolds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bioimpedance" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "origin" "BioimpedanceOrigin" NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weight_kg" DOUBLE PRECISION,
    "body_fat_percent" DOUBLE PRECISION,
    "fat_mass_kg" DOUBLE PRECISION,
    "lean_mass_kg" DOUBLE PRECISION,
    "skeletal_muscle_mass_kg" DOUBLE PRECISION,
    "muscle_mass_kg" DOUBLE PRECISION,
    "body_water_percent" DOUBLE PRECISION,
    "visceral_fat_level" DOUBLE PRECISION,
    "basal_metabolic_rate_kcal" DOUBLE PRECISION,
    "body_age_years" INTEGER,
    "bone_mass_kg" DOUBLE PRECISION,
    "segmental_data" JSONB,
    "impedance_data" JSONB,

    CONSTRAINT "bioimpedance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculated_metrics" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "bmi" DOUBLE PRECISION,
    "bmi_classification" TEXT,
    "waist_hip_ratio" DOUBLE PRECISION,
    "body_fat_percent" DOUBLE PRECISION,
    "body_fat_percent_source" "BodyFatSource",
    "fat_mass_kg" DOUBLE PRECISION,
    "lean_mass_kg" DOUBLE PRECISION,
    "protocol_version_used" TEXT,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calculated_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "body_photos" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "angle" "PhotoAngle" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_professional_id" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "body_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_audit_logs" (
    "id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "evaluation_id" TEXT,
    "action" "EvaluationAuditAction" NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "protocols_code_key" ON "protocols"("code");

-- CreateIndex
CREATE INDEX "physical_evaluations_client_id_evaluated_at_idx" ON "physical_evaluations"("client_id", "evaluated_at");

-- CreateIndex
CREATE INDEX "physical_evaluations_professional_id_idx" ON "physical_evaluations"("professional_id");

-- CreateIndex
CREATE UNIQUE INDEX "measurements_evaluation_id_key" ON "measurements"("evaluation_id");

-- CreateIndex
CREATE UNIQUE INDEX "skinfolds_evaluation_id_key" ON "skinfolds"("evaluation_id");

-- CreateIndex
CREATE UNIQUE INDEX "bioimpedance_evaluation_id_key" ON "bioimpedance"("evaluation_id");

-- CreateIndex
CREATE UNIQUE INDEX "calculated_metrics_evaluation_id_key" ON "calculated_metrics"("evaluation_id");

-- CreateIndex
CREATE INDEX "body_photos_evaluation_id_idx" ON "body_photos"("evaluation_id");

-- CreateIndex
CREATE INDEX "evaluation_audit_logs_evaluation_id_idx" ON "evaluation_audit_logs"("evaluation_id");

-- CreateIndex
CREATE INDEX "evaluation_audit_logs_professional_id_created_at_idx" ON "evaluation_audit_logs"("professional_id", "created_at");

-- AddForeignKey
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_superseded_by_protocol_id_fkey" FOREIGN KEY ("superseded_by_protocol_id") REFERENCES "protocols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_evaluations" ADD CONSTRAINT "physical_evaluations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_evaluations" ADD CONSTRAINT "physical_evaluations_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_evaluations" ADD CONSTRAINT "physical_evaluations_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "protocols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "physical_evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skinfolds" ADD CONSTRAINT "skinfolds_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "physical_evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bioimpedance" ADD CONSTRAINT "bioimpedance_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "physical_evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculated_metrics" ADD CONSTRAINT "calculated_metrics_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "physical_evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "body_photos" ADD CONSTRAINT "body_photos_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "physical_evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_audit_logs" ADD CONSTRAINT "evaluation_audit_logs_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_audit_logs" ADD CONSTRAINT "evaluation_audit_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_audit_logs" ADD CONSTRAINT "evaluation_audit_logs_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "physical_evaluations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
