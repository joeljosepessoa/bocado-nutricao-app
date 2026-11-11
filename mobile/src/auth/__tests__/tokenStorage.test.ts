const store: Record<string, string> = {};
let failRead = false;

jest.mock(
  'expo-secure-store',
  () => ({
    getItemAsync: jest.fn(async (key: string) => {
      if (failRead) throw new Error('Could not decrypt the item in SecureStore');
      return store[key] ?? null;
    }),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      delete store[key];
    }),
  }),
  { virtual: true },
);

import { tokenStorage } from '../tokenStorage';

describe('tokenStorage (aparelho)', () => {
  beforeEach(() => {
    failRead = false;
    for (const k of Object.keys(store)) delete store[k];
  });

  it('guarda e lê o login', async () => {
    await tokenStorage.setRefreshToken('abc');
    await expect(tokenStorage.getRefreshToken()).resolves.toBe('abc');
  });

  it('login guardado ilegível não trava a abertura: descarta e volta sem sessão', async () => {
    await tokenStorage.setRefreshToken('abc');
    failRead = true;
    await expect(tokenStorage.getRefreshToken()).resolves.toBeNull();
    expect(store['bocado.refreshToken']).toBeUndefined();
  });
});
