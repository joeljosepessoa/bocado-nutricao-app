import { BadRequestException, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ClientBillingWebhookService } from './client-billing-webhook.service';

/**
 * Webhook público do comercial cliente (Fase 23.5) — deliberadamente
 * separado de `/billing/webhook` (SaaS, Fase 22): domínios diferentes,
 * esquemas de assinatura diferentes (aqui é o manifest real do Mercado
 * Pago; lá é HMAC sobre o corpo, do mock). Nunca reaproveita
 * BillingWebhookController/BillingCycleService.
 *
 * `data.id` vem da query string (é o que compõe o manifest da assinatura
 * — confirmado na documentação oficial), com fallback pro corpo só para
 * tolerância a variação de formato; nunca o contrário.
 */
@Public()
@Controller('client-billing/webhook')
export class ClientBillingWebhookController {
  constructor(private readonly webhookService: ClientBillingWebhookService) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async receive(@Req() req: Request) {
    const dataId = this.extractDataId(req);
    const type = this.extractType(req);
    const xSignature = req.header('x-signature');
    const requestId = req.header('x-request-id');

    const result = await this.webhookService.process(
      { type, dataId, requestId, xSignature },
      { ipAddress: req.ip },
    );

    if (!result.accepted) {
      throw new BadRequestException('Webhook inválido.');
    }
    return { received: true };
  }

  private extractDataId(req: Request): string | undefined {
    const fromQuery = req.query['data.id'];
    if (typeof fromQuery === 'string') {
      return fromQuery;
    }
    const body = req.body as { data?: { id?: string | number } } | undefined;
    return body?.data?.id !== undefined ? String(body.data.id) : undefined;
  }

  private extractType(req: Request): string | undefined {
    const fromQuery = req.query['type'];
    if (typeof fromQuery === 'string') {
      return fromQuery;
    }
    const body = req.body as { type?: string } | undefined;
    return body?.type;
  }
}
