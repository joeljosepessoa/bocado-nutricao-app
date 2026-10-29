import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CustomFormsService } from './custom-forms.service';
import { CreateCustomFormDto, CreateFormResponseDto, UpdateCustomFormDto, UpdateFormResponseDto } from './dto/custom-form.dto';

/** Formulários próprios do profissional (menu Formulários). */
@Controller('forms')
@Roles(Role.professional)
export class CustomFormsController {
  constructor(private readonly forms: CustomFormsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('trash') trash?: string) {
    return this.forms.list(user.id, trash === 'true');
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.forms.get(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCustomFormDto) {
    return this.forms.create(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomFormDto) {
    return this.forms.update(user.id, id, dto);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.forms.duplicate(user.id, id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.forms.restore(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.forms.remove(user.id, id);
  }
}

/** Formulários preenchidos pelo profissional para um paciente. */
@Controller('clients/:clientId/form-responses')
@Roles(Role.professional)
export class ClientFormResponsesController {
  constructor(private readonly forms: CustomFormsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.forms.listResponses(user.id, clientId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('clientId', ParseUUIDPipe) clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.forms.getResponse(user.id, clientId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Param('clientId', ParseUUIDPipe) clientId: string, @Body() dto: CreateFormResponseDto) {
    return this.forms.createResponse(user.id, clientId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFormResponseDto,
  ) {
    return this.forms.updateResponse(user.id, clientId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('clientId', ParseUUIDPipe) clientId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.forms.removeResponse(user.id, clientId, id);
  }
}
