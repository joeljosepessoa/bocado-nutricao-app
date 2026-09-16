import { IsEnum } from 'class-validator';
import { ReportAudience } from '@prisma/client';

export class CreateReportDto {
  @IsEnum(ReportAudience)
  audience!: ReportAudience;
}
