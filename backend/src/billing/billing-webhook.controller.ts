import { BadRequestException, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymentGatewayService } from './gateway/payment-gateway.service';
import { BillingAuditLogService } from './billing-audit-log.service';
import { BillingAuditAction } from '@prisma/client';

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

/**
 * Endpoint de webhook do gateway de pagamento. Verificação de assinatura
 * está aqui e é real (ver MockPaymentGatewayService.verifyWebhookSignature)
 * — mas hoje só o nosso próprio simulador (BillingCycleService) chama
 * este fluxo internamente; sem um gateway real configurado, nenhum
 * tráfego externo chega aqui. Fica inerte até `STORAGE`-style de gateway
 * real ser conectado (mesma postura de S3/Sentry: código real, sem
 * credencial inventada).
 */
@Public()
@Controller('billing/webhook')
export class BillingWebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGatewayService,
    private readonly auditLog: BillingAuditLogService,
  ) {}

  @Post()
  async receive(@Req() req: RequestWithRawBody) {
    const signature = req.header('x-webhook-signature');
    const rawBody = req.rawBody ? req.rawBody.toString('utf-8') : JSON.stringify(req.body ?? {});

    if (!signature || !this.gateway.verifyWebhookSignature(rawBody, signature)) {
      throw new BadRequestException('Assinatura de webhook inválida.');
    }

    // Nunca confia em professionalId vindo direto do payload — resolve
    // pela referência que nós mesmos demos ao gateway (gatewaySubscriptionId)
    // para não gravar auditoria com uma FK que não existe.
    const payload = req.body as { gatewaySubscriptionId?: string; type?: string };
    if (payload.gatewaySubscriptionId) {
      const subscription = await this.prisma.subscription.findFirst({
        where: { gatewaySubscriptionId: payload.gatewaySubscriptionId },
      });
      if (subscription) {
        await this.auditLog.record({
          professionalId: subscription.professionalId,
          subscriptionId: subscription.id,
          action: BillingAuditAction.webhook_received,
          metadata: { type: payload.type },
        });
      }
    }

    return { received: true };
  }
}
