import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdateDeviceConnectionDto {
  @IsOptional()
  @IsBoolean()
  sharedWithProfessional?: boolean;

  // Só 'revoked' — reconectar depois de revogada exige criar uma nova
  // DeviceConnection, não reabrir a antiga (mesma lógica de revogação de
  // refresh token: revogar é terminal). 'error' fica reservado no enum
  // para uso futuro por um processo de sincronização, não pelo cliente.
  @IsOptional()
  @IsIn(['revoked'])
  status?: 'revoked';
}
