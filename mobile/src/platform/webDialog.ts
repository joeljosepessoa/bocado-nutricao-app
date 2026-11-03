/** Botão no formato do Alert do React Native (só o que importa aqui). */
export interface DialogButton {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface BrowserDialogs {
  alert(text: string): void;
  confirm(text: string): boolean;
}

/**
 * No navegador o Alert do react-native-web não mostra nada — "Sair", "Apagar
 * foto" e os avisos do treino sumiriam calados. Aqui ele vira a caixa nativa
 * do navegador: só aviso → alert; "Cancelar" + uma ação → confirm.
 * Os textos e as ações continuam os mesmos das telas. Função pura (testável em node).
 */
export function showBrowserDialog(
  title: string,
  message: string | undefined,
  buttons: DialogButton[] | undefined,
  dialogs: BrowserDialogs,
): void {
  const text = message ? `${title}\n\n${message}` : title;
  const list = buttons ?? [];
  let cancel = list.find((button) => button.style === 'cancel');
  let actions = list.filter((button) => button !== cancel);
  // Duas opções sem "cancel" marcado: a primeira faz o papel de cancelar.
  if (!cancel && actions.length > 1) {
    cancel = actions[0];
    actions = actions.slice(1);
  }
  const action = actions[actions.length - 1];

  if (!cancel) {
    dialogs.alert(text);
    action?.onPress?.();
    return;
  }
  if (dialogs.confirm(text)) action?.onPress?.();
  else cancel.onPress?.();
}
