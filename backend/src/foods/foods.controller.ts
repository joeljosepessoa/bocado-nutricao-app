import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { FoodsService } from './foods.service';
import { CreateFoodDto } from './dto/create-food.dto';
import { UpdateFoodDto } from './dto/update-food.dto';
import { CreateSubstitutionDto } from './dto/create-substitution.dto';

@Controller('foods')
@Roles(Role.professional)
export class FoodsController {
  constructor(private readonly foodsService: FoodsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFoodDto) {
    return this.foodsService.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('search') search?: string) {
    return this.foodsService.list(user.id, search);
  }

  /** Tela "Alimentos": TACO + alimentos do profissional, com busca, grupo, origem e paginação. */
  @Get('library')
  library(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('group') group?: string,
    @Query('origin') origin?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.foodsService.library(user.id, {
      search,
      group,
      origin: origin === 'taco' || origin === 'mine' || origin === 'shared' ? origin : 'all',
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  /** Ficha completa: nutrientes da TACO, medidas caseiras e onde o alimento é usado. */
  @Get(':id/details')
  details(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.foodsService.details(user.id, id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.foodsService.findVisible(user.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateFoodDto) {
    return this.foodsService.update(user, id, dto);
  }

  /** Exclui alimento próprio que ainda não foi usado em dieta nem modelo. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.foodsService.remove(user.id, id);
  }

  @Post(':id/substitutions')
  createSubstitution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateSubstitutionDto,
  ) {
    return this.foodsService.createSubstitution(user.id, id, dto);
  }

  @Get(':id/substitutions')
  listSubstitutions(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.foodsService.listSubstitutions(user.id, id);
  }

  @Delete(':id/substitutions/:substitutionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSubstitution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('substitutionId') substitutionId: string,
  ): Promise<void> {
    await this.foodsService.deleteSubstitution(user.id, id, substitutionId);
  }
}
