import type { Skinfolds } from '../types/api';

/**
 * Protocolos de dobras do formulário da avaliação — mesmas dobras do servidor
 * (backend/src/physical-evaluations/skinfold-protocols.ts), que é quem calcula.
 * Aqui só serve para mostrar quais dobras medir e avisar o que falta.
 */
type Site = keyof Skinfolds;

export interface SkinfoldProtocolOption {
  code: string;
  label: string;
  sites: { male: Site[]; female: Site[] };
  needsSex: boolean;
  needsAge: boolean;
  /** Idade mínima da tabela da equação, por sexo. */
  minAge?: { male: number; female: number };
}

const JP7: Site[] = ['chestMm', 'axillaryMidMm', 'tricepsMm', 'subscapularMm', 'abdominalMm', 'suprailiacMm', 'thighMm'];

export const SKINFOLD_PROTOCOL_OPTIONS: SkinfoldProtocolOption[] = [
  { code: 'jackson_pollock_7', label: 'Pollock — 7 dobras', sites: { male: JP7, female: JP7 }, needsSex: true, needsAge: true },
  {
    code: 'jackson_pollock_3',
    label: 'Pollock — 3 dobras',
    sites: { male: ['chestMm', 'abdominalMm', 'thighMm'], female: ['tricepsMm', 'suprailiacMm', 'thighMm'] },
    needsSex: true,
    needsAge: true,
  },
  {
    code: 'guedes_3',
    label: 'Guedes — 3 dobras',
    sites: { male: ['tricepsMm', 'suprailiacMm', 'abdominalMm'], female: ['thighMm', 'suprailiacMm', 'subscapularMm'] },
    needsSex: true,
    needsAge: false,
  },
  {
    code: 'durnin_womersley_4',
    label: 'Durnin & Womersley — 4 dobras',
    sites: { male: ['bicepsMm', 'tricepsMm', 'subscapularMm', 'suprailiacMm'], female: ['bicepsMm', 'tricepsMm', 'subscapularMm', 'suprailiacMm'] },
    needsSex: true,
    needsAge: true,
    minAge: { male: 17, female: 16 },
  },
  {
    code: 'faulkner_4',
    label: 'Faulkner — 4 dobras',
    sites: { male: ['tricepsMm', 'subscapularMm', 'suprailiacMm', 'abdominalMm'], female: ['tricepsMm', 'subscapularMm', 'suprailiacMm', 'abdominalMm'] },
    needsSex: false,
    needsAge: false,
  },
];

export const findProtocolOption = (code: string) => SKINFOLD_PROTOCOL_OPTIONS.find((p) => p.code === code) ?? null;

/** Dobras que entram na conta; sem sexo num protocolo que muda por sexo, null (ainda não dá para saber). */
export function requiredSites(code: string, sex: 'male' | 'female' | ''): Site[] | null {
  const protocol = findProtocolOption(code);
  if (!protocol) return null;
  if (sex) return protocol.sites[sex];
  const same = protocol.sites.male.join() === protocol.sites.female.join();
  return same ? protocol.sites.male : null;
}

/**
 * Aviso antes de salvar quando o % de gordura por dobras não vai sair — ou null se está tudo certo.
 * `labelOf` dá o nome da dobra para a mensagem.
 */
export function skinfoldWarningText(
  code: string,
  sex: 'male' | 'female' | '',
  age: number | null,
  filledSites: Set<Site>,
  labelOf: (site: Site) => string,
): string | null {
  const protocol = findProtocolOption(code);
  if (!protocol) return null;
  const sites = requiredSites(code, sex);
  if (!sites) return 'Informe o sexo em "Dados básicos": as dobras deste protocolo são diferentes para homens e mulheres.';
  const missing = sites.filter((s) => !filledSites.has(s));
  if (missing.length > 0) return `Sem estas dobras o % de gordura não é calculado: ${missing.map(labelOf).join(', ')}.`;
  const missingBasics = [protocol.needsAge && age == null ? 'a idade' : null, protocol.needsSex && !sex ? 'o sexo' : null].filter(Boolean);
  if (missingBasics.length > 0) return `Para calcular o % de gordura falta informar ${missingBasics.join(' e ')} em "Dados básicos".`;
  if (protocol.minAge && sex && age != null && age < protocol.minAge[sex]) {
    return `${protocol.label.split(' —')[0]} só vale a partir de ${protocol.minAge[sex]} anos — escolha outro protocolo.`;
  }
  return null;
}
