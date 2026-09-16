import { computeDeterministicTrend, daysBetween } from '../src/ai/use-cases/compute-deterministic-trend';
import { AiTimeoutError, callProviderWithResilience } from '../src/ai/providers/call-with-resilience';
import { MockAiProvider } from '../src/ai/providers/mock-ai.provider';
import { isValidResult } from '../src/ai/ai.service';
import type { AiGenerationRequest, AiGenerationResult, AiProvider } from '../src/ai/providers/ai-provider.interface';

describe('isValidResult — nunca assume que o provedor devolveu o formato correto', () => {
  it('rejeita ausente, vazio ou só espaço em branco', () => {
    expect(isValidResult(undefined)).toBe(false);
    expect(isValidResult(null)).toBe(false);
    expect(isValidResult('')).toBe(false);
    expect(isValidResult('   ')).toBe(false);
  });

  it('aceita texto não vazio', () => {
    expect(isValidResult('ok')).toBe(true);
  });
});

function point(overrides: Partial<{ weightKg: number | null; bmi: number | null; bodyFatPercent: number | null }> = {}) {
  return {
    evaluatedAt: new Date('2026-01-01T00:00:00.000Z'),
    weightKg: 80,
    bmi: 25,
    bodyFatPercent: 20,
    ...overrides,
  };
}

describe('computeDeterministicTrend — cálculo determinístico, sem IA', () => {
  it('calcula delta para cada métrica presente nos dois pontos', () => {
    const previous = point({ weightKg: 82, bmi: 25.5, bodyFatPercent: 21 });
    const current = point({ weightKg: 80, bmi: 24.8, bodyFatPercent: 19.5 });

    const metrics = computeDeterministicTrend(previous, current);

    expect(metrics).toEqual([
      { label: 'Peso', unit: 'kg', previousValue: 82, currentValue: 80, delta: -2 },
      { label: 'IMC', unit: '', previousValue: 25.5, currentValue: 24.8, delta: -0.7 },
      { label: '% de gordura', unit: '%', previousValue: 21, currentValue: 19.5, delta: -1.5 },
    ]);
  });

  it('omite uma métrica quando ausente em qualquer um dos dois pontos — nunca inventa', () => {
    const previous = point({ bmi: null });
    const current = point();

    const metrics = computeDeterministicTrend(previous, current);

    expect(metrics.map((m) => m.label)).toEqual(['Peso', '% de gordura']);
  });

  it('devolve lista vazia quando nenhuma métrica é comparável', () => {
    const previous = point({ weightKg: null, bmi: null, bodyFatPercent: null });
    const current = point({ weightKg: null, bmi: null, bodyFatPercent: null });

    expect(computeDeterministicTrend(previous, current)).toEqual([]);
  });

  it('delta é sempre currentValue - previousValue (não o inverso)', () => {
    const metrics = computeDeterministicTrend(point({ weightKg: 70 }), point({ weightKg: 75 }));
    expect(metrics.find((m) => m.label === 'Peso')?.delta).toBe(5);
  });
});

describe('daysBetween', () => {
  it('calcula dias entre duas datas, sempre positivo', () => {
    expect(daysBetween(new Date('2026-01-01'), new Date('2026-01-11'))).toBe(10);
    expect(daysBetween(new Date('2026-01-11'), new Date('2026-01-01'))).toBe(10);
  });
});

describe('MockAiProvider — determinístico, sem rede', () => {
  it('nunca inventa um valor que não esteja no contexto', async () => {
    const provider = new MockAiProvider();
    const result = await provider.generate({
      promptVersion: 'x@v1',
      systemPrompt: 'irrelevante para o mock',
      context: { weightKg: 71.4, note: 'ok' },
      maxOutputChars: 4000,
    });
    expect(result.text).toContain('71.4');
    expect(result.text).toContain('ok');
    expect(result.text).not.toMatch(/\d{3,}/); // nenhum número de 3+ dígitos "inventado"
  });

  it('mesmo contexto sempre produz o mesmo texto (determinístico)', async () => {
    const provider = new MockAiProvider();
    const request: AiGenerationRequest = {
      promptVersion: 'x@v1',
      systemPrompt: 'irrelevante',
      context: { a: 1, b: 'dois' },
      maxOutputChars: 4000,
    };
    const first = await provider.generate(request);
    const second = await provider.generate(request);
    expect(first.text).toBe(second.text);
  });

  it('respeita maxOutputChars', async () => {
    const provider = new MockAiProvider();
    const result = await provider.generate({
      promptVersion: 'x@v1',
      systemPrompt: 'irrelevante',
      context: { longField: 'a'.repeat(500) },
      maxOutputChars: 20,
    });
    expect(result.text.length).toBeLessThanOrEqual(20);
  });
});

describe('callProviderWithResilience — timeout e retry limitado, nunca recursivo', () => {
  const request: AiGenerationRequest = {
    promptVersion: 'x@v1',
    systemPrompt: 's',
    context: {},
    maxOutputChars: 100,
  };

  it('devolve o resultado normalmente quando o provider responde a tempo', async () => {
    const provider = new MockAiProvider();
    const result = await callProviderWithResilience(provider, request, { timeoutMs: 1000, maxRetries: 0 });
    expect(result.model).toBe('mock-v1');
  });

  it('lança AiTimeoutError quando o provider demora mais que timeoutMs', async () => {
    const slowProvider: AiProvider = {
      id: 'slow-test',
      generate: () => new Promise<AiGenerationResult>((resolve) => setTimeout(() => resolve({ text: 'tarde', model: 'x' }), 200)),
    };
    await expect(callProviderWithResilience(slowProvider, request, { timeoutMs: 20, maxRetries: 0 })).rejects.toBeInstanceOf(
      AiTimeoutError,
    );
  });

  it('tenta de novo até maxRetries antes de desistir, nunca além disso', async () => {
    let attempts = 0;
    const flakyProvider: AiProvider = {
      id: 'flaky-test',
      generate: async () => {
        attempts += 1;
        throw new Error('falhou');
      },
    };
    await expect(callProviderWithResilience(flakyProvider, request, { timeoutMs: 1000, maxRetries: 2 })).rejects.toThrow(
      'falhou',
    );
    expect(attempts).toBe(3); // 1 tentativa + 2 retries, nunca mais
  });

  it('sucesso numa tentativa posterior não continua tentando', async () => {
    let attempts = 0;
    const eventuallyOkProvider: AiProvider = {
      id: 'eventually-ok',
      generate: async () => {
        attempts += 1;
        if (attempts < 2) throw new Error('falhou');
        return { text: 'ok na segunda', model: 'x' };
      },
    };
    const result = await callProviderWithResilience(eventuallyOkProvider, request, { timeoutMs: 1000, maxRetries: 2 });
    expect(result.text).toBe('ok na segunda');
    expect(attempts).toBe(2);
  });
});
