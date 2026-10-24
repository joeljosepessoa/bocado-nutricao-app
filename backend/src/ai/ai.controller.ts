import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiFeatureKey, Role } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { AiService, RequestMeta } from './ai.service';
import { GenerateAiContentDto } from './dto/generate-ai-content.dto';
import { GenerateClientAiContentDto } from './dto/generate-client-ai-content.dto';
import { TemplateDietChatDto, TemplateWorkoutChatDto } from './dto/template-chat.dto';

// Mesmo padrão de AUTH_THROTTLE_LIMIT (auth-http.util.ts): baixo por padrão
// em produção, elevado via env nos testes e2e para não travar a própria
// suíte (test/jest-e2e.setup.js). Chamada de IA é mais cara que um login,
// por isso o teto de produção é mais restrito (decisão 11 — limite de
// requisições).
const AI_GENERATE_THROTTLE_LIMIT = Number(process.env.AI_GENERATE_THROTTLE_LIMIT ?? 10);

function meta(req: Request): RequestMeta {
  return { ipAddress: req.ip };
}

@Controller('professionals/me/ai')
@Roles(Role.professional)
export class ProfessionalAiConsentController {
  constructor(private readonly aiService: AiService) {}

  @Post('consent')
  recordConsent(@CurrentUser() user: AuthenticatedUser) {
    return this.aiService.recordProfessionalConsent(user.id);
  }
}

@Controller('client/ai')
@Roles(Role.client)
export class ClientAiController {
  constructor(private readonly aiService: AiService) {}

  // Consentimento de IA do PRÓPRIO cliente (o papel `client` garante que nunca é dado pelo profissional).
  @Get('consent')
  getConsent(@CurrentUser() user: AuthenticatedUser) {
    return this.aiService.getClientConsent(user.id);
  }

  @Post('consent')
  recordConsent(@CurrentUser() user: AuthenticatedUser) {
    return this.aiService.recordClientConsent(user.id);
  }

  @Delete('consent')
  revokeConsent(@CurrentUser() user: AuthenticatedUser) {
    return this.aiService.revokeClientConsent(user.id);
  }

  @Throttle({ default: { limit: AI_GENERATE_THROTTLE_LIMIT, ttl: 60_000 } })
  @Post('generate')
  async generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateClientAiContentDto,
    @Req() req: Request,
  ) {
    const professionalId = await this.aiService.resolveProfessionalIdForClient(user.id);
    return this.aiService.generate({
      professionalId,
      clientId: user.id,
      requireProfessionalConsent: false,
      feature: dto.feature,
      input: dto,
      meta: meta(req),
    });
  }
}

@Controller('clients/:clientId/ai')
@Roles(Role.professional)
export class ProfessionalClientAiController {
  constructor(private readonly aiService: AiService) {}

  @Throttle({ default: { limit: AI_GENERATE_THROTTLE_LIMIT, ttl: 60_000 } })
  @Post('generate')
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Body() dto: GenerateAiContentDto,
    @Req() req: Request,
  ) {
    return this.aiService.generate({
      professionalId: user.id,
      clientId,
      requireProfessionalConsent: true,
      feature: dto.feature,
      input: dto,
      meta: meta(req),
    });
  }

  @Get('interactions')
  listInteractions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
  ) {
    return this.aiService.listInteractionsForProfessional(
      user.id,
      clientId,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
  }
}

/**
 * Conversa com a IA nos Modelos (biblioteca, sem paciente). Só o consentimento de IA do PRÓPRIO
 * profissional vale aqui: o contexto é o pedido dele, o modelo atual e o catálogo — nenhum dado de paciente.
 */
@Controller('templates/ai')
@Roles(Role.professional)
export class TemplateAiController {
  constructor(private readonly aiService: AiService) {}

  @Throttle({ default: { limit: AI_GENERATE_THROTTLE_LIMIT, ttl: 60_000 } })
  @Post('diet')
  diet(@CurrentUser() user: AuthenticatedUser, @Body() dto: TemplateDietChatDto, @Req() req: Request) {
    return this.aiService.generate({
      professionalId: user.id,
      clientId: null,
      requireProfessionalConsent: true,
      feature: AiFeatureKey.template_diet_chat,
      input: dto,
      meta: meta(req),
    });
  }

  @Throttle({ default: { limit: AI_GENERATE_THROTTLE_LIMIT, ttl: 60_000 } })
  @Post('workout')
  workout(@CurrentUser() user: AuthenticatedUser, @Body() dto: TemplateWorkoutChatDto, @Req() req: Request) {
    return this.aiService.generate({
      professionalId: user.id,
      clientId: null,
      requireProfessionalConsent: true,
      feature: AiFeatureKey.template_workout_chat,
      input: dto,
      meta: meta(req),
    });
  }
}
