-- Avaliação física: escolhas do profissional que o formulário passa a ter.
-- Só acrescenta colunas opcionais; nenhuma linha existente muda.

-- De onde vem o % de gordura (dobras ou bioimpedância) e qual fórmula dá a
-- faixa de referência do metabolismo basal.
ALTER TABLE "physical_evaluations"
  ADD COLUMN "body_fat_method" "BodyFatSource",
  ADD COLUMN "bmr_reference" TEXT;

-- Aparelho da bioimpedância digitada.
ALTER TABLE "bioimpedance"
  ADD COLUMN "equipment" TEXT;
