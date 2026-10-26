import { Global, Module } from '@nestjs/common';
import { ClientLegalController, LegalDocumentsController } from './legal.controller';
import { LegalService } from './legal.service';
import { LegalConsentGuard } from './legal-consent.guard';

@Global()
@Module({
  controllers: [LegalDocumentsController, ClientLegalController],
  providers: [LegalService, LegalConsentGuard],
  exports: [LegalService, LegalConsentGuard],
})
export class LegalModule {}
