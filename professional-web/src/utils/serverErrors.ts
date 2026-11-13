/** Nomes dos campos como aparecem na tela, para as mensagens de validação do servidor. */
const FIELD_LABELS: Record<string, string> = {
  heightCm: 'Altura',
  weightKg: 'Peso',
  ageAtEvaluation: 'Idade',
  bloodPressureSystolic: 'Pressão sistólica',
  bloodPressureDiastolic: 'Pressão diastólica',
  heartRate: 'Frequência cardíaca',
  glucose: 'Glicemia',
  bodyFatPercent: 'Gordura corporal',
  fatMassKg: 'Massa gorda',
  leanMassKg: 'Massa magra',
  skeletalMuscleMassKg: 'Músculo esquelético',
  muscleMassKg: 'Massa muscular',
  boneMassKg: 'Massa óssea',
  bodyWaterPercent: 'Água corporal',
  visceralFatLevel: 'Gordura visceral',
  basalMetabolicRateKcal: 'Metabolismo basal',
  bodyAgeYears: 'Idade corporal',
  evaluatedAt: 'Data da avaliação',
};

const decimal = (n: string) => n.replace('.', ',');

/**
 * As mensagens de validação do servidor vêm em inglês ("heightCm must not be less
 * than 30"). Traduz as mais comuns; o resto passa como veio.
 */
export function translateServerMessage(message: string): string {
  const m = message.trim().match(/^(?:[\w]+\.)*(\w+) (.+)$/);
  if (!m) return message;
  const [, field, rest] = m;
  const label = FIELD_LABELS[field] ?? field;
  let r: RegExpMatchArray | null;
  if ((r = rest.match(/^must not be less than (-?[\d.]+)$/))) return `${label} não pode ser menor que ${decimal(r[1])}`;
  if ((r = rest.match(/^must not be greater than (-?[\d.]+)$/))) return `${label} não pode ser maior que ${decimal(r[1])}`;
  if (/^must be a number/.test(rest)) return `${label} precisa ser um número`;
  if (/^must be an integer number$/.test(rest)) return `${label} precisa ser um número inteiro`;
  if (/^should not be empty$/.test(rest)) return `${label} é obrigatório`;
  if (/^must be a valid ISO 8601 date string$/.test(rest)) return `${label} não é uma data válida`;
  return message;
}
