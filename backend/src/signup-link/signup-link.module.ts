import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfessionalSignupLinkController, PublicSignupController } from './signup-link.controller';
import { SignupLinkService } from './signup-link.service';

@Module({
  imports: [AuthModule],
  controllers: [ProfessionalSignupLinkController, PublicSignupController],
  providers: [SignupLinkService],
})
export class SignupLinkModule {}
