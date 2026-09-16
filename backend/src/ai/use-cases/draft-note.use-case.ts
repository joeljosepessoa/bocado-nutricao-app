import { Injectable } from '@nestjs/common';
import { AiFeatureKey } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AiContextResult, AiUseCase, BuildContextParams } from './ai-use-case.interface';
import type { GenerateAiContentDto } from '../dto/generate-ai-content.dto';

const SYSTEM_PROMPT =
  'Você ajuda um profissional de nutrição/educação física a redigir um RASCUNHO de nota, a partir só das ' +
  'instruções fornecidas por ele. Escreva um texto objetivo e profissional. Não invente informação clínica que ' +
  'não esteja nas instruções. Nunca diagnostique, nunca prescreva, nunca sugira tratamento ou medicação. Deixe ' +
  'claro que é um rascunho a ser revisado.';

/**
 * Funcionalidade A do design aprovado — só profissional, nunca o cliente.
 * Contexto mínimo: nome do cliente (para personalização) + o texto que o
 * próprio profissional já digitou. Nenhum outro dado é buscado no banco.
 */
@Injectable()
export class DraftNoteUseCase implements AiUseCase {
  readonly feature = AiFeatureKey.draft_note;
  readonly promptVersion = 'draft_note@v1';

  constructor(private readonly prisma: PrismaService) {}

  async buildContext({ clientId, input }: BuildContextParams): Promise<AiContextResult> {
    const dto = input as GenerateAiContentDto;
    const client = await this.prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { user: { select: { fullName: true } } },
    });
    const clientFirstName = client.user.fullName.split(' ')[0];

    return {
      systemPrompt: SYSTEM_PROMPT,
      context: {
        clientFirstName,
        entityType: dto.entityType,
        instructions: dto.instructions,
      },
    };
  }
}
