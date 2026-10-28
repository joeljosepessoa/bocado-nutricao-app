import { IsUUID } from 'class-validator';

/** Exercício da biblioteca cujo GIF passa a ser mostrado no exercício particular. */
export class LinkLibraryGifDto {
  @IsUUID() fromExerciseId!: string;
}
