import { changePasswordFailureMessage, newPasswordError, passwordChecklist } from '../passwordRules';

describe('senha nova (mesmas regras do servidor)', () => {
  it('exige 10 caracteres, letra e número, e confirmação igual', () => {
    expect(newPasswordError('abc12345x', 'abc12345x')).toMatch(/10 caracteres/);
    expect(newPasswordError('abcdefghij', 'abcdefghij')).toMatch(/letra e um número/);
    expect(newPasswordError('1234567890', '1234567890')).toMatch(/letra e um número/);
    expect(newPasswordError('bocado2026x', 'bocado2026y')).toMatch(/não coincidem/);
    expect(newPasswordError('bocado2026x', 'bocado2026x')).toBeNull();
  });

  it('mensagem certa para cada recusa do servidor', () => {
    expect(changePasswordFailureMessage(401, 'Senha atual incorreta.')).toBe('A senha temporária atual está incorreta.');
    expect(changePasswordFailureMessage(400, ['A senha deve ter pelo menos 10 caracteres.'])).toBe('A senha deve ter pelo menos 10 caracteres.');
    expect(changePasswordFailureMessage(400, undefined)).toMatch(/não foi aceita/);
    expect(changePasswordFailureMessage(undefined, undefined)).toMatch(/Sem conexão/);
    expect(changePasswordFailureMessage(500, 'x')).toMatch(/Tente novamente/);
  });
});

describe('lista de requisitos da senha', () => {
  it('marca cada requisito conforme a digitação', () => {
    expect(passwordChecklist('', '').map((r) => r.ok)).toEqual([false, false, false, false]);
    expect(passwordChecklist('bocado2026', 'bocado').map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(passwordChecklist('bocado2026x', 'bocado2026x').every((r) => r.ok)).toBe(true);
  });
});
