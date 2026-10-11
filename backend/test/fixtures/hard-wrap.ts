/**
 * Quebra cada linha na largura dada, sem cortar palavras — como o texto chega
 * quando é copiado de um PDF ou do Word: a linha acaba no meio da frase
 * ("... + salada à" / "vontade + 8 g de azeite.").
 */
export function hardWrap(text: string, width: number): string {
  return text
    .split('\n')
    .flatMap((line) => {
      const wrapped: string[] = [];
      let current = '';
      for (const word of line.split(' ')) {
        if (current && `${current} ${word}`.length > width) {
          wrapped.push(current);
          current = word;
        } else {
          current = current ? `${current} ${word}` : word;
        }
      }
      wrapped.push(current);
      return wrapped;
    })
    .join('\n');
}
