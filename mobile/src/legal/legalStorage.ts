import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PendingAcceptance } from './legalGate';

/**
 * Guardado no aparelho (não é segredo, por isso AsyncStorage):
 * - DEVICE: a tela de boas-vindas já foi aceita neste aparelho (não mostra de novo antes do login);
 * - PENDING: aceite da primeira abertura ainda não enviado ao servidor (vai logo após o login).
 */
const DEVICE_KEY = 'bocado.legal.deviceAccepted';
const PENDING_KEY = 'bocado.legal.pending';

async function safe<T>(op: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await op();
  } catch {
    return fallback;
  }
}

export const legalStorage = {
  isDeviceAccepted(): Promise<boolean> {
    return safe(async () => (await AsyncStorage.getItem(DEVICE_KEY)) === '1', false);
  },
  async markDeviceAccepted(): Promise<void> {
    await safe(() => AsyncStorage.setItem(DEVICE_KEY, '1'), undefined);
  },
  getPending(): Promise<PendingAcceptance | null> {
    return safe(async () => {
      const raw = await AsyncStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PendingAcceptance>;
      return parsed.termsVersion && parsed.privacyVersion && parsed.checkedAt ? (parsed as PendingAcceptance) : null;
    }, null);
  },
  async setPending(pending: PendingAcceptance): Promise<void> {
    await safe(() => AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending)), undefined);
  },
  async clearPending(): Promise<void> {
    await safe(() => AsyncStorage.removeItem(PENDING_KEY), undefined);
  },
};
