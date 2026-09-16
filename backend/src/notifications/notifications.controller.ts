import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { DeviceTokensService } from './device-tokens.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { RevokeDeviceTokenDto } from './dto/revoke-device-token.dto';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';

// Profissional e cliente usam os mesmos endpoints (cada um só enxerga/altera
// o próprio dono) — mesmo padrão de amplitude de role já usado quando uma
// funcionalidade é simétrica nos dois lados (ex.: troca de senha).
@Controller('notifications')
@Roles(Role.professional, Role.client)
export class NotificationsController {
  constructor(
    private readonly deviceTokens: DeviceTokensService,
    private readonly preferences: NotificationPreferencesService,
  ) {}

  @Post('device-tokens')
  registerDeviceToken(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDeviceTokenDto) {
    return this.deviceTokens.register(user, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('device-tokens/revoke')
  async revokeDeviceToken(@CurrentUser() user: AuthenticatedUser, @Body() dto: RevokeDeviceTokenDto): Promise<void> {
    await this.deviceTokens.revoke(user, dto.token);
  }

  @Get('preferences')
  listPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.preferences.list(user);
  }

  @Patch('preferences')
  updatePreference(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateNotificationPreferenceDto) {
    return this.preferences.update(user, dto);
  }
}
