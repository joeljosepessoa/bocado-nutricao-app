import {
  addSeconds,
  createTimer,
  formatSeconds,
  getRemainingSeconds,
  isFinished,
  isRunning,
  pauseTimer,
  resetTimer,
  startTimer,
} from '../restTimer';

describe('restTimer', () => {
  it('cria um timer parado com o total como tempo restante', () => {
    const timer = createTimer(60);
    expect(isRunning(timer)).toBe(false);
    expect(getRemainingSeconds(timer)).toBe(60);
  });

  it('calcula o restante a partir do timestamp, não de um contador decrementado', () => {
    const t0 = 1_000_000;
    let timer = createTimer(90);
    timer = startTimer(timer, t0);

    expect(getRemainingSeconds(timer, t0)).toBe(90);
    expect(getRemainingSeconds(timer, t0 + 30_000)).toBe(60);
    expect(getRemainingSeconds(timer, t0 + 89_000)).toBe(1);
  });

  it('nunca fica negativo mesmo muito depois do fim', () => {
    const t0 = 1_000_000;
    const timer = startTimer(createTimer(10), t0);
    expect(getRemainingSeconds(timer, t0 + 999_000)).toBe(0);
    expect(isFinished(timer, t0 + 999_000)).toBe(true);
  });

  it('sobrevive a uma pausa longa em segundo plano: o relógio, não um tick, define o restante', () => {
    const t0 = 1_000_000;
    let timer = startTimer(createTimer(60), t0);

    // App vai para segundo plano aos 10s decorridos...
    timer = pauseTimer(timer, t0 + 10_000);
    expect(getRemainingSeconds(timer)).toBe(50);

    // ...fica minutos em segundo plano sem nenhum tick rodando...
    // ao voltar (retomar), o relógio real é usado, não um contador acumulado.
    const resumedAt = t0 + 5 * 60_000;
    timer = startTimer(timer, resumedAt);
    expect(getRemainingSeconds(timer, resumedAt)).toBe(50);
    expect(getRemainingSeconds(timer, resumedAt + 50_000)).toBe(0);
  });

  it('pausar e retomar preserva exatamente o tempo restante no instante da pausa', () => {
    const t0 = 0;
    let timer = startTimer(createTimer(120), t0);
    timer = pauseTimer(timer, t0 + 45_000);
    expect(getRemainingSeconds(timer)).toBe(75);
    expect(isRunning(timer)).toBe(false);

    timer = startTimer(timer, t0 + 999_000);
    expect(getRemainingSeconds(timer, t0 + 999_000)).toBe(75);
  });

  it('reseta para o total original', () => {
    const t0 = 0;
    let timer = startTimer(createTimer(30), t0);
    timer = pauseTimer(timer, t0 + 20_000);
    timer = resetTimer(timer);
    expect(getRemainingSeconds(timer)).toBe(30);
    expect(isRunning(timer)).toBe(false);
  });

  it('permite ajustar +/- segundos enquanto rodando, sem perder precisão', () => {
    const t0 = 0;
    let timer = startTimer(createTimer(60), t0);
    timer = addSeconds(timer, 15, t0 + 10_000); // 50 restantes + 15 = 65
    expect(getRemainingSeconds(timer, t0 + 10_000)).toBe(65);

    timer = addSeconds(timer, -100, t0 + 10_000);
    expect(getRemainingSeconds(timer, t0 + 10_000)).toBe(0);
  });

  it('permite ajustar +/- segundos enquanto pausado', () => {
    let timer = createTimer(60);
    timer = addSeconds(timer, -20);
    expect(getRemainingSeconds(timer)).toBe(40);
  });

  it('formata mm:ss', () => {
    expect(formatSeconds(0)).toBe('0:00');
    expect(formatSeconds(5)).toBe('0:05');
    expect(formatSeconds(65)).toBe('1:05');
    expect(formatSeconds(600)).toBe('10:00');
  });
});
