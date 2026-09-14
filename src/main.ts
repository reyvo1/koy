import { Logger } from '@nestjs/common';
import { toStructuredLogError } from './common/logging/log-error';
import { createProductionApplication } from './bootstrap/production-application';
import { startProductionApplication } from './bootstrap/production-runtime';

const bootstrapLogger = new Logger('Bootstrap');

export async function bootstrap(): Promise<void> {
  await startProductionApplication(createProductionApplication);
}

if (require.main === module) {
  void bootstrap().catch((error) => {
    bootstrapLogger.error({
      event: 'application.startup.failed',
      outcome: 'failed',
      error: toStructuredLogError(error),
    });
    process.exitCode = 1;
  });
}
