import { Injectable } from '@nestjs/common';
import type { AiGenerationRequest, AiGenerationResult, AiProvider } from './ai-provider.interface';

/**
 * Único provedor existente nesta fase — decisão 5/20: nenhum fornecedor
 * externo (OpenAI/Anthropic/OpenRouter/etc.) é integrado ainda. Roda
 * localmente, sem chamada de rede, determinístico (mesmo contexto sempre
 * produz o mesmo texto) — o que faz os testes serem reproduzíveis sem
 * depender de rede nem gastar orçamento de um provedor real.
 *
 * Deliberadamente "burro": só descreve o contexto que o use case montou,
 * nunca inventa um valor que não esteja em `context` — a mesma regra que
 * um provedor real teria que seguir (o Prompt Assembler é quem instrui
 * "não invente", este mock só prova que o pipeline nunca precisa que o
 * provedor calcule nada sozinho).
 */
@Injectable()
export class MockAiProvider implements AiProvider {
  readonly id = 'mock-local';

  async generate(request: AiGenerationRequest): Promise<AiGenerationResult> {
    const lines = Object.entries(request.context)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${humanizeKey(key)}: ${formatValue(value)}`);

    const body = ['[Conteúdo gerado por IA — provedor local de teste, sem chamada externa]', ...lines].join('\n');
    const text = body.slice(0, request.maxOutputChars);

    return {
      text,
      model: 'mock-v1',
      tokensUsed: { input: JSON.stringify(request.context).length, output: text.length },
      providerRequestId: undefined,
    };
  }
}

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => formatValue(item)).join('; ');
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${humanizeKey(key)}=${formatValue(val)}`)
      .join(', ');
  }
  return String(value);
}
