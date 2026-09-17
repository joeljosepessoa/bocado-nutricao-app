import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { SubscriptionsService } from './subscriptions.service';
import { REQUIRES_ACTIVE_SUBSCRIPTION_KEY } from './requires-active-subscription.decorator';

@Injectable()
export class RequiresActiveSubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRES_ACTIVE_SUBSCRIPTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!user) {
      return false;
    }
    const hasAccess = await this.subscriptions.hasActiveAccess(user.id);
    if (!hasAccess) {
      throw new ForbiddenException('Este recurso exige uma assinatura em dia.');
    }
    return true;
  }
}
