import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { DietTemplateContentDto, WorkoutTemplateContentDto } from '../../templates/dto/template.dto';

export const CHAT_MESSAGE_MAX = 4000;
export const CHAT_HISTORY_MAX = 30;

/** Uma fala da conversa: do profissional ou a resposta anterior da IA (o painel guarda o histórico e reenvia). */
export class ChatMessageDto {
  @IsIn(['professional', 'assistant']) role!: 'professional' | 'assistant';
  @IsString() @Matches(/\S/, { message: 'Mensagem vazia.' }) @MaxLength(CHAT_MESSAGE_MAX) text!: string;
}

class ChatBase {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CHAT_HISTORY_MAX)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];
}

/** Conversa no modelo de dieta: histórico + o modelo como está agora no editor (null = modelo novo, em branco). */
export class TemplateDietChatDto extends ChatBase {
  @IsOptional() @ValidateNested() @Type(() => DietTemplateContentDto) current?: DietTemplateContentDto | null;
}

/** Conversa no modelo de treino. */
export class TemplateWorkoutChatDto extends ChatBase {
  @IsOptional() @ValidateNested() @Type(() => WorkoutTemplateContentDto) current?: WorkoutTemplateContentDto | null;
}
