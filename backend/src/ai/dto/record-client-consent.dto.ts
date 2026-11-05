import { Equals, IsIn } from 'class-validator';

export const CONSENT_METHODS = ['whatsapp', 'paper', 'in_person'] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

/** O profissional registra uma autorização que o paciente deu fora do app e declara que ela existe. */
export class RecordClientConsentDto {
  @IsIn(CONSENT_METHODS, { message: 'Escolha como o paciente autorizou.' }) method!: ConsentMethod;
  @Equals(true, { message: 'Confirme que o paciente autorizou.' }) confirmed!: true;
}
