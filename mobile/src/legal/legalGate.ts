/**
 * Regras do aceite dos Termos de Uso / Política de Privacidade no app — funções puras (sem
 * react-native) para serem testadas em Jest/node. Quem decide de verdade é o servidor
 * (rota /client/legal/accept + trava TERMS_REQUIRED); aqui é só o fluxo de telas.
 */
import type { LegalVersions, SessionUser } from '../types/api';

/** Aceite feito na primeira abertura do app, antes do login: enviado ao servidor logo após entrar. */
export interface PendingAcceptance extends LegalVersions {
  /** Quando a pessoa tocou em "Continuar" (ISO). */
  checkedAt: string;
  /** Marcou também a autorização das análises automáticas (obrigatória desde o app 1.4.0). */
  aiConsent?: boolean;
}

/**
 * Paciente precisa aceitar? Servidor novo manda `termsAcceptanceRequired`; servidor antigo
 * não manda — aí vale o aceite antigo (privacyAcceptedAt).
 */
export function termsRequired(user: Pick<SessionUser, 'role' | 'privacyAcceptedAt' | 'termsAcceptanceRequired'>): boolean {
  if (user.role !== 'client') return false;
  if (typeof user.termsAcceptanceRequired === 'boolean') return user.termsAcceptanceRequired;
  return !user.privacyAcceptedAt;
}

/** "Continuar" só libera com as três caixas marcadas e os documentos carregados. */
export function canContinue(acceptTerms: boolean, acceptPrivacy: boolean, acceptAi: boolean, versions: LegalVersions | null): boolean {
  return acceptTerms && acceptPrivacy && acceptAi && !!versions?.termsVersion && !!versions?.privacyVersion;
}

/**
 * A autorização das análises automáticas é obrigatória para usar o app (decisão do profissional
 * responsável, 29/10/2026). Só paciente; sem resposta do servidor (offline) não trava.
 */
export function aiConsentMissing(role: SessionUser['role'], consent: { aiDataProcessingConsentAt: string | null } | null): boolean {
  return role === 'client' && consent !== null && !consent.aiDataProcessingConsentAt;
}

/**
 * Depois de entrar: se o servidor pede o aceite e há um aceite da primeira abertura, ele é
 * enviado sozinho (a pessoa já marcou as caixas). Sem aceite pendente, a tela aparece.
 */
export function afterSessionAction(user: SessionUser, pending: PendingAcceptance | null): 'none' | 'send_pending' | 'ask' {
  if (!termsRequired(user)) return 'none';
  return pending ? 'send_pending' : 'ask';
}

/** Erro 403 da trava do servidor ("aceite os termos para continuar"). */
export function isTermsRequiredError(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { code?: unknown } } })?.response;
  return response?.status === 403 && response.data?.code === 'TERMS_REQUIRED';
}

/** Erro 400 de versão desatualizada (o texto mudou enquanto a tela estava aberta). */
export function isOutdatedVersionError(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { code?: unknown } } })?.response;
  return response?.status === 400 && response.data?.code === 'LEGAL_VERSION_OUTDATED';
}

/** "Aceitos em 26/10/2026 às 14:32". */
export function acceptedAtLabel(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString('pt-BR');
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `Aceitos em ${day} às ${time}.`;
}

/** "26/10/2026" a partir de "2026-10-26" (sem fuso: é uma data de calendário). */
export function versionDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return y && m && d ? `${d}/${m}/${y}` : isoDate;
}
