import { BadRequestException, Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ClientStatus, Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ClientsService } from './clients.service';
import { UpdateClientDto } from './dto/update-client.dto';

const VALID_STATUS_FILTERS = [...Object.values(ClientStatus), 'all'];

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Roles(Role.professional)
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (status && !VALID_STATUS_FILTERS.includes(status)) {
      throw new BadRequestException(
        `status inválido. Use um de: ${VALID_STATUS_FILTERS.join(', ')}.`,
      );
    }

    return this.clientsService.listForProfessional(user.id, {
      search,
      status: status as ClientStatus | 'all' | undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Roles(Role.client)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.me(user.id);
  }

  @Roles(Role.professional)
  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.clientsService.findOneForProfessional(user.id, id);
  }

  @Roles(Role.professional)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(user.id, id, dto);
  }
}
