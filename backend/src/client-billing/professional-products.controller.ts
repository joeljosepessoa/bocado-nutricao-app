import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ProfessionalProductsService, RequestMeta } from './professional-products.service';
import { CreateProfessionalProductDto } from './dto/create-professional-product.dto';
import { UpdateProfessionalProductDto } from './dto/update-professional-product.dto';

function meta(req: Request): RequestMeta {
  return { ipAddress: req.ip };
}

@Controller('professionals/me/products')
@Roles(Role.professional)
export class ProfessionalProductsController {
  constructor(private readonly products: ProfessionalProductsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProfessionalProductDto, @Req() req: Request) {
    return this.products.create(user.id, dto, meta(req));
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.products.list(user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProfessionalProductDto,
    @Req() req: Request,
  ) {
    return this.products.update(user.id, id, dto, meta(req));
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/deactivate')
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.products.deactivate(user.id, id, meta(req));
  }
}
