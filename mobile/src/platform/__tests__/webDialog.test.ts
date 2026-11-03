import { showBrowserDialog, type BrowserDialogs } from '../webDialog';

function dialogs(confirmAnswer: boolean): BrowserDialogs & { shown: string[] } {
  const shown: string[] = [];
  return {
    shown,
    alert: (text) => void shown.push(`alert:${text}`),
    confirm: (text) => {
      shown.push(`confirm:${text}`);
      return confirmAnswer;
    },
  };
}

describe('caixas de aviso na versão web', () => {
  it('só aviso: mostra título e mensagem e roda o OK, se houver', () => {
    const d = dialogs(true);
    const ok = jest.fn();
    showBrowserDialog('Treino salvo!', '3 séries registradas.', [{ text: 'OK', onPress: ok }], d);
    expect(d.shown).toEqual(['alert:Treino salvo!\n\n3 séries registradas.']);
    expect(ok).toHaveBeenCalled();

    const d2 = dialogs(true);
    showBrowserDialog('Nenhuma série marcada', undefined, undefined, d2);
    expect(d2.shown).toEqual(['alert:Nenhuma série marcada']);
  });

  it('Cancelar + ação: confirmar roda a ação, cancelar roda o cancelar', () => {
    const sair = jest.fn();
    const cancelar = jest.fn();
    const buttons = [
      { text: 'Cancelar', style: 'cancel' as const, onPress: cancelar },
      { text: 'Sair', style: 'destructive' as const, onPress: sair },
    ];
    const yes = dialogs(true);
    showBrowserDialog('Sair', 'Deseja realmente sair?', buttons, yes);
    expect(yes.shown).toEqual(['confirm:Sair\n\nDeseja realmente sair?']);
    expect(sair).toHaveBeenCalledTimes(1);
    expect(cancelar).not.toHaveBeenCalled();

    showBrowserDialog('Sair', 'Deseja realmente sair?', buttons, dialogs(false));
    expect(sair).toHaveBeenCalledTimes(1);
    expect(cancelar).toHaveBeenCalledTimes(1);
  });

  it('duas opções sem "cancel" marcado: a primeira é a de cancelar', () => {
    const nao = jest.fn();
    const sim = jest.fn();
    showBrowserDialog('Pergunta', undefined, [{ text: 'Não', onPress: nao }, { text: 'Sim', onPress: sim }], dialogs(false));
    expect(nao).toHaveBeenCalled();
    expect(sim).not.toHaveBeenCalled();
  });
});
