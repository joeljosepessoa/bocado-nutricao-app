import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ScaleReadingsService, RequestMeta } from './scale-readings.service';
import { ConfirmScaleReadingDto } from './dto/confirm-scale-reading.dto';

function meta(req: Request): RequestMeta {
  return { ipAddress: req.ip };
}

@Controller('clients/:clientId/evaluations/:evaluationId/scale-readings')
@Roles(Role.professional)
export class ScaleReadingsController {
  constructor(private readonly scaleReadingsService: ScaleReadingsService) {}

  @Post()
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('evaluationId') evaluationId: string,
    @Body() dto: ConfirmScaleReadingDto,
    @Req() req: Request,
  ) {
    return this.scaleReadingsService.confirm(user.id, clientId, evaluationId, dto, meta(req));
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('evaluationId') evaluationId: string,
    @Req() req: Request,
  ) {
    return this.scaleReadingsService.list(user.id, clientId, evaluationId, meta(req));
  }
}
