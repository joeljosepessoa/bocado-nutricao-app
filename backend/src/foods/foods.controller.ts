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

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.foodsService.findVisible(user.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateFoodDto) {
    return this.foodsService.update(user, id, dto);
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
