import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorTrackingService } from './error-tracking.service';
import { ConsoleErrorTrackingService } from './console-error-tracking.service';
import { SentryErrorTrackingService } from './sentry-error-tracking.service';

@Global()
@Module({
  providers: [
    {
      provide: ErrorTrackingService,
      useFactory: (config: ConfigService) =>
        (config.get<string>('ERROR_TRACKING_PROVIDER') ?? 'console') === 'sentry'
          ? new SentryErrorTrackingService(config)
          : new ConsoleErrorTrackingService(),
      inject: [ConfigService],
    },
  ],
  exports: [ErrorTrackingService],
})
export class ErrorTrackingModule {}
