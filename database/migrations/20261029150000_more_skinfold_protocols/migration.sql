-- Mais protocolos de dobras cutâneas (só dados; nenhuma mudança de estrutura).
-- As equações ficam em backend/src/physical-evaluations/skinfold-protocols.ts; aqui só o
-- cadastro para a avaliação poder guardar qual protocolo usou. Nos protocolos com dobras
-- diferentes por sexo, required_skinfold_sites guarda todas as que podem entrar na conta.
INSERT INTO "protocols" ("id", "code", "name", "description", "required_skinfold_sites", "sex_specific", "version")
VALUES
  (gen_random_uuid()::text, 'jackson_pollock_3', 'Jackson & Pollock — 3 dobras',
   'Homens: peitoral, abdominal e coxa (Jackson & Pollock, 1978). Mulheres: tríceps, supra-ilíaca e coxa (Jackson, Pollock & Ward, 1980). Densidade convertida para % de gordura por Siri (1961).',
   ARRAY['chest', 'abdominal', 'thigh', 'triceps', 'suprailiac'], true, 1),
  (gen_random_uuid()::text, 'guedes_3', 'Guedes — 3 dobras',
   'Equação brasileira de Guedes (1985). Homens: tríceps, supra-ilíaca e abdominal; mulheres: coxa, supra-ilíaca e subescapular. Densidade convertida para % de gordura por Siri (1961).',
   ARRAY['triceps', 'suprailiac', 'abdominal', 'thigh', 'subscapular'], true, 1),
  (gen_random_uuid()::text, 'durnin_womersley_4', 'Durnin & Womersley — 4 dobras',
   'Bíceps, tríceps, subescapular e supra-ilíaca (Durnin & Womersley, 1974), coeficientes por sexo e faixa de idade (homens a partir de 17 anos, mulheres a partir de 16). Densidade convertida por Siri (1961).',
   ARRAY['biceps', 'triceps', 'subscapular', 'suprailiac'], true, 1),
  (gen_random_uuid()::text, 'faulkner_4', 'Faulkner — 4 dobras',
   'Tríceps, subescapular, supra-ilíaca e abdominal: % de gordura = 0,153 × soma + 5,783 (Faulkner, 1968). Não depende de sexo nem idade.',
   ARRAY['triceps', 'subscapular', 'suprailiac', 'abdominal'], false, 1)
ON CONFLICT ("code") DO NOTHING;
