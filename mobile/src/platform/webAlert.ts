import { Alert, Platform } from 'react-native';
import { showBrowserDialog } from './webDialog';

/** Na versão web, o Alert das telas passa a usar a caixa de aviso/confirmação do navegador. */
export function installWebAlert(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  Alert.alert = (title, message, buttons) =>
    showBrowserDialog(title, message, buttons, { alert: (text) => window.alert(text), confirm: (text) => window.confirm(text) });
}
