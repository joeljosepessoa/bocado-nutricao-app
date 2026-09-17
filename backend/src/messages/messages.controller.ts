import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { MessagesService, RequestMeta } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';

function meta(req: Request): RequestMeta {
  return { ipAddress: req.ip };
}

@Controller('clients/:clientId/messages')
@Roles(Role.professional)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('clientId') clientId: string, @Req() req: Request) {
    return this.messagesService.listForProfessional(user.id, clientId, meta(req));
  }

  @Post()
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Body() dto: CreateMessageDto,
    @Req() req: Request,
  ) {
    return this.messagesService.sendFromProfessional(user.id, clientId, dto.body, meta(req));
  }
}
