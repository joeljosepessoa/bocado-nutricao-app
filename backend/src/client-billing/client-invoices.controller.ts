import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ClientInvoicesService } from './client-invoices.service';

@Controller('professionals/me/client-invoices')
@Roles(Role.professional)
export class ClientInvoicesController {
  constructor(private readonly invoices: ClientInvoicesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('clientId') clientId?: string) {
    return this.invoices.listForProfessional(user.id, clientId);
  }
}
