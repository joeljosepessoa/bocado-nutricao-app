/**
 * Aviso "salve o app na tela de início": só para quem abriu a versão web num
 * iPhone/iPad pelo navegador. Depois de salvo, o app abre em tela cheia
 * (standalone) e o aviso some. Função pura (testável em node).
 */
export function shouldShowInstallHint(env: {
  os: string;
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
}): boolean {
  if (env.os !== 'web' || env.standalone) return false;
  const apple = /iPhone|iPad|iPod/.test(env.userAgent);
  // O iPad moderno se apresenta como Mac — a diferença é a tela de toque.
  const iPadAsMac = /Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1;
  return apple || iPadAsMac;
}

/** Lê o ambiente do navegador; fora dele (app nativo, testes) devolve "não mostrar". */
export function browserInstallHint(os: string): boolean {
  if (os !== 'web' || typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
  return shouldShowInstallHint({ os, userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0, standalone });
}
