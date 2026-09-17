import { SetMetadata } from '@nestjs/common';

export const REQUIRES_ACTIVE_SUBSCRIPTION_KEY = 'requiresActiveSubscription';

/**
 * Marca uma rota (do profissional) como exigindo assinatura em dia
 * (trialing ou active). Nenhuma rota existente usa isto ainda — quais
 * recursos ficam atrás de um plano pago é decisão de produto do usuário,
 * não algo para inventar retroativamente sobre funcionalidades já
 * entregues em fases anteriores. Ver RequiresActiveSubscriptionGuard.
 */
export const RequiresActiveSubscription = () => SetMetadata(REQUIRES_ACTIVE_SUBSCRIPTION_KEY, true);
