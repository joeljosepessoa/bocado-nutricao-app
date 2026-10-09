import { IsBoolean } from 'class-validator';

export class PhotoSharingDto {
  @IsBoolean()
  shared!: boolean;
}
