import { IsBoolean } from 'class-validator';

export class UpdateEvaluationReleaseDto {
  @IsBoolean()
  released!: boolean;
}
