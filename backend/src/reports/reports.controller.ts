import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ReportAudience, Role } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ReportsService, RequestMeta } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportReleaseDto } from './dto/update-report-release.dto';

function meta(req: Request): RequestMeta {
  return { ipAddress: req.ip };
}

@Controller('clients/:clientId/reports')
@Roles(Role.professional)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Query('evaluationId') evaluationId: string | undefined,
    @Query('audience') audience: ReportAudience | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
  ) {
    return this.reportsService.list(
      user.id,
      clientId,
      { evaluationId, audience },
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
  }

  @Get(':reportId')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('reportId') reportId: string,
  ) {
    return this.reportsService.findOne(user.id, clientId, reportId);
  }

  @Get(':reportId/download-url')
  getDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('reportId') reportId: string,
    @Req() req: Request,
  ) {
    return this.reportsService.getDownloadUrl(user.id, clientId, reportId, meta(req));
  }

  @Patch(':reportId/release')
  setRelease(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('reportId') reportId: string,
    @Body() dto: UpdateReportReleaseDto,
    @Req() req: Request,
  ) {
    return this.reportsService.setRelease(user.id, clientId, reportId, dto.released, meta(req));
  }

  @Delete(':reportId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('reportId') reportId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.reportsService.remove(user.id, clientId, reportId, meta(req));
  }
}

@Controller('clients/:clientId/evaluations/:evaluationId/reports')
@Roles(Role.professional)
export class EvaluationReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('evaluationId') evaluationId: string,
    @Body() dto: CreateReportDto,
    @Req() req: Request,
  ) {
    return this.reportsService.create(user.id, clientId, evaluationId, dto, meta(req));
  }
}
