import * as SecureStore from 'expo-secure-store';

/**
 * Mesma decisão do app do cliente (Fase 7): o refresh token é o único
 * segredo de longa duração no dispositivo — keychain/keystore via
 * expo-secure-store, nunca AsyncStorage. O access token vive só em memória
 * (ver AuthContext) e nunca é gravado em disco.
 */
const REFRESH_TOKEN_KEY = 'bocado.professional.refreshToken';

export const tokenStorage = {
  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },
  async setRefreshToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },
};
