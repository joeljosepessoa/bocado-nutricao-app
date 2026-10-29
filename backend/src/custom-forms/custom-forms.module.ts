import { Module } from '@nestjs/common';
import { ClientFormResponsesController, CustomFormsController } from './custom-forms.controller';
import { CustomFormsService } from './custom-forms.service';

@Module({
  controllers: [CustomFormsController, ClientFormResponsesController],
  providers: [CustomFormsService],
  exports: [CustomFormsService],
})
export class CustomFormsModule {}
