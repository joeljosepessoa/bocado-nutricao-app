import { AiOutputValidationError } from '../../ai-errors';
import { AnthropicAiProvider, type AnthropicClient } from '../../providers/anthropic-ai.provider';
import { AI_PROVIDERS } from '../../providers/ai-provider-catalog';
import type { AiProviderCredentials } from '../../providers/ai-provider.interface';
import type { FoodsService } from '../../../foods/foods.service';
import { FOOD_WARNINGS, OrganizeDietUseCase, type OrganizedDietProposal } from './organize-diet.use-case';
import { ORGANIZED_DIET_JSON_SCHEMA } from './organized-diet.schema';

const DIET_TEXT = 'CAFÉ DA MANHÃ\n2 fatias de pão integral\n150 g de fruta';
const item = (sourceText: string, food: string, quantity: number, unit: string) => ({ sourceText, food, quantity, quantityMax: null, unit, freeQuantity: false, notes: null });
const AI_JSON = {
  days: [
    {
      label: null,
      kind: 'other',
      usageNotes: null,
      meals: [
        {
          name: 'CAFÉ DA MANHÃ',
          time: null,
          notes: null,
          groups: [{ kind: 'fixed', label: null, choices: [{ label: null, items: [item('2 fatias de pão integral', 'Pão integral', 2, 'fatias'), item('150 g de fruta', 'Fruta', 150, 'g')] }] }],
        },
      ],
    },
  ],
  supplements: [],
  guidelines: [],
  warnings: [],
};
const itemsOf = (proposal: OrganizedDietProposal) => proposal.days[0].meals[0].groups[0].choices[0].items;

const foodsService = {
  listVisibleRefs: jest.fn().mockResolvedValue([{ id: 'f5', name: 'Pão integral' }, { id: 'f4', name: 'Banana prata' }]),
  listAutoLinkAliases: jest.fn().mockResolvedValue([]),
};
const useCase = new OrganizeDietUseCase(foodsService as unknown as FoodsService);
const params = (dietText = DIET_TEXT) => ({ professionalId: 'p1', clientId: 'c1', input: { feature: 'organize_diet', dietText } });

describe('OrganizeDietUseCase', () => {
  it('contexto é SÓ o texto colado — nenhum dado do cliente (peso, avaliação, exames) é lido', async () => {
    const ctx = await useCase.buildContext(params());
    expect(Object.keys(ctx.context)).toEqual(['dietText']);
    expect(ctx.context.dietText).toBe(DIET_TEXT);
    expect(ctx.systemPrompt).toMatch(/NÃO cria, NÃO completa, NÃO corrige e NÃO sugere/);
    expect(useCase.requiresStructuredOutput).toBe(true);
  });

  it('gera PROPOSTA: associa só nome igual; o resto fica para revisão', async () => {
    const out = await useCase.processOutput({ text: JSON.stringify(AI_JSON), model: 'x' }, params());
    const proposal = out.structuredData as unknown as OrganizedDietProposal;
    const [bread, fruit] = itemsOf(proposal);
    expect(bread).toMatchObject({ matchStatus: 'matched', matchedFood: { id: 'f5' }, quantity: 2, unit: 'slice' });
    expect(fruit).toMatchObject({ matchStatus: 'not_found', matchedFood: null, quantity: 150, unit: 'g' });
    expect(fruit.warnings[0]).toBe(FOOD_WARNINGS.notFound);
  });

  it('nome escrito que não é igual ao do catálogo liga pelo apelido aprovado (lista do Bocado × TACO)', async () => {
    foodsService.listAutoLinkAliases.mockResolvedValueOnce([{ alias: 'fruta', food: { id: 'f4', name: 'Banana prata' } }]);
    const out = await useCase.processOutput({ text: JSON.stringify(AI_JSON), model: 'x' }, params());
    const [, fruit] = itemsOf(out.structuredData as unknown as OrganizedDietProposal);
    expect(fruit).toMatchObject({ matchStatus: 'matched', matchedFood: { id: 'f4' }, rawFood: expect.stringMatching(/fruta/i) });
    expect(fruit.warnings).not.toContain(FOOD_WARNINGS.notFound);
    expect(foodsService.listAutoLinkAliases).toHaveBeenCalledWith('p1');
  });

  it('resposta que altera a prescrição ou não é JSON é recusada', async () => {
    const altered = structuredClone(AI_JSON);
    altered.days[0].meals[0].groups[0].choices[0].items[1].quantity = 200;
    await expect(useCase.processOutput({ text: JSON.stringify(altered), model: 'x' }, params())).rejects.toBeInstanceOf(AiOutputValidationError);
    await expect(useCase.processOutput({ text: 'Claro! Aqui está sua dieta.', model: 'x' }, params())).rejects.toThrow(/não é JSON/);
    await expect(useCase.processOutput({ text: '{}', model: 'x', truncated: true }, params())).rejects.toThrow(/longa demais/);
  });
});

/** Mesmo provedor que o AiService usa em produção (SDK simulado, sem rede). */
class ProviderWithFakeSdk extends AnthropicAiProvider {
  readonly create = jest.fn();
  protected override createClient(): AnthropicClient {
    return { beta: { messages: { create: this.create } } } as unknown as AnthropicClient;
  }
}

describe('organize_diet com o provedor Anthropic', () => {
  it('envia o JSON Schema da dieta como saída estruturada e a resposta passa pela mesma conferência', async () => {
    const provider = new ProviderWithFakeSdk();
    provider.create.mockResolvedValue({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(AI_JSON) }],
      usage: { input_tokens: 10, output_tokens: 10 },
    });
    const ctx = await useCase.buildContext(params());
    const creds: AiProviderCredentials = { apiKey: 'sk-ant-falsa', model: AI_PROVIDERS.anthropic.defaultModel! };
    const result = await provider.generate(
      { promptVersion: useCase.promptVersion, systemPrompt: ctx.systemPrompt, context: ctx.context, maxOutputChars: useCase.maxOutputChars, responseSchema: ORGANIZED_DIET_JSON_SCHEMA },
      creds,
    );
    expect(provider.create.mock.calls[0][0].output_config).toEqual({ format: { type: 'json_schema', schema: ORGANIZED_DIET_JSON_SCHEMA } });
    const out = await useCase.processOutput(result, params());
    expect(itemsOf(out.structuredData as unknown as OrganizedDietProposal)).toHaveLength(2);
  });
});
