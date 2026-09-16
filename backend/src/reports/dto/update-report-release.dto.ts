import { IsBoolean } from 'class-validator';

export class UpdateReportReleaseDto {
  @IsBoolean()
  released!: boolean;
}
