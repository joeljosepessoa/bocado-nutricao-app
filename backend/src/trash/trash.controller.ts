import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseEnumPipe, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { TRASH_KINDS, TrashService, type TrashKind } from './trash.service';

const kindPipe = new ParseEnumPipe(Object.fromEntries(TRASH_KINDS.map((k) => [k, k])));

/** Lixeira do painel: lista o que foi excluído, restaura e apaga de vez. */
@Controller('trash')
@Roles(Role.professional)
export class TrashController {
  constructor(private readonly trash: TrashService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return { items: await this.trash.list(user.id) };
  }

  @Post(':kind/:id/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  async restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind', kindPipe) kind: TrashKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.trash.restore(user.id, kind, id, { ipAddress: req.ip });
  }

  @Delete(':kind/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async purge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind', kindPipe) kind: TrashKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.trash.purge(user.id, kind, id, { ipAddress: req.ip });
  }
}
