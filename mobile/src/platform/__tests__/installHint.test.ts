import { shouldShowInstallHint } from '../installHint';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

describe('aviso para salvar na tela de início', () => {
  it('aparece no iPhone e no iPad pelo navegador', () => {
    expect(shouldShowInstallHint({ os: 'web', userAgent: IPHONE, maxTouchPoints: 5, standalone: false })).toBe(true);
    expect(shouldShowInstallHint({ os: 'web', userAgent: MAC, maxTouchPoints: 5, standalone: false })).toBe(true);
  });

  it('some depois de salvo, e não aparece em Mac, Android nem no app nativo', () => {
    expect(shouldShowInstallHint({ os: 'web', userAgent: IPHONE, maxTouchPoints: 5, standalone: true })).toBe(false);
    expect(shouldShowInstallHint({ os: 'web', userAgent: MAC, maxTouchPoints: 0, standalone: false })).toBe(false);
    expect(shouldShowInstallHint({ os: 'web', userAgent: ANDROID, maxTouchPoints: 5, standalone: false })).toBe(false);
    expect(shouldShowInstallHint({ os: 'ios', userAgent: IPHONE, maxTouchPoints: 5, standalone: false })).toBe(false);
  });
});
