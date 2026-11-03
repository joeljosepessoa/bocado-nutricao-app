/**
 * Versão web (app aberto no navegador / salvo na tela de início do iPhone):
 * o navegador não tem keychain, então o refresh token fica no armazenamento
 * do próprio site — isolado por endereço, sem acesso de outros sites. O
 * access token continua só em memória (ver AuthContext).
 */
const REFRESH_TOKEN_KEY = 'bocado.refreshToken';

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Navegação privada com o armazenamento bloqueado: o app funciona, só não lembra o login.
    return null;
  }
}

export const tokenStorage = {
  async getRefreshToken(): Promise<string | null> {
    try {
      return storage()?.getItem(REFRESH_TOKEN_KEY) ?? null;
    } catch {
      return null;
    }
  },
  async setRefreshToken(token: string): Promise<void> {
    try {
      storage()?.setItem(REFRESH_TOKEN_KEY, token);
    } catch {
      /* sem armazenamento: o login vale só enquanto a página estiver aberta */
    }
  },
  async clear(): Promise<void> {
    try {
      storage()?.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      /* nada a limpar */
    }
  },
};
