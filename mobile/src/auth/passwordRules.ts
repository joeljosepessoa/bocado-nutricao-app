/**
 * Regras da senha nova — as MESMAS do servidor (ChangePasswordDto): ao menos
 * 10 caracteres, com pelo menos uma letra e um número. PURO, para teste.
 */
export const MIN_PASSWORD_LENGTH = 10;
export const PASSWORD_HINT = `Mínimo de ${MIN_PASSWORD_LENGTH} caracteres, com letras e números.`;

export function newPasswordError(newPassword: string, confirmPassword: string): string | null {
  if (newPassword.length < MIN_PASSWORD_LENGTH) return `A nova senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) return 'A nova senha deve ter pelo menos uma letra e um número.';
  if (newPassword !== confirmPassword) return 'As senhas não coincidem.';
  return null;
}

/** Mensagem certa para cada recusa do servidor (antes, toda recusa dizia "confira a senha atual"). */
export function changePasswordFailureMessage(status: number | undefined, serverMessage: unknown): string {
  if (status === 401) return 'A senha temporária atual está incorreta.';
  if (status === 400) {
    const text = Array.isArray(serverMessage) ? serverMessage.join(' ') : typeof serverMessage === 'string' ? serverMessage : '';
    return text || `A nova senha não foi aceita. ${PASSWORD_HINT}`;
  }
  if (status === undefined) return 'Sem conexão. Verifique a internet e tente novamente.';
  return 'Não foi possível trocar a senha agora. Tente novamente.';
}

export interface PasswordRule {
  label: string;
  ok: boolean;
}

/** Lista que a tela mostra enquanto a pessoa digita (cada item fica verde quando cumprido). */
export function passwordChecklist(newPassword: string, confirmPassword: string): PasswordRule[] {
  return [
    { label: `Pelo menos ${MIN_PASSWORD_LENGTH} caracteres`, ok: newPassword.length >= MIN_PASSWORD_LENGTH },
    { label: 'Pelo menos uma letra', ok: /[A-Za-z]/.test(newPassword) },
    { label: 'Pelo menos um número', ok: /\d/.test(newPassword) },
    { label: 'Confirmação igual à nova senha', ok: newPassword.length > 0 && newPassword === confirmPassword },
  ];
}
