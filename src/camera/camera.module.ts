import { Module } from '@nestjs/common';

import { CameraController } from './camera.controller';
import { MEDIA_RUNTIME_URL, MediaRuntimeService } from './media-runtime.service';
import { OnvifDiscoveryService } from './onvif-discovery.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * The camera discovery and playback surface.
 *
 * Deliberately separate from `CameraOnboardingModule`. Onboarding writes a device row; this reads
 * the network and talks to a media runtime. Different failure modes, different blast radius, and no
 * reason for a discovery broadcast to share a module boundary with a credential-writing path.
 */
@Module({
  // PrismaModule is required, not incidental: `TenantContextGuard` resolves the caller's membership
  // through Prisma, and without it the container restart-loops with
  // UnknownDependenciesException on `PrismaService`. Same failure class as the MediaRuntimeService
  // string parameter -- a provider graph gap that no unit test can see, because tests construct the
  // guard directly and never go through Nest's injector.
  imports: [PrismaModule],
  controllers: [CameraController],
  providers: [
    OnvifDiscoveryService,
    // Provided from the environment so the address is never written in code. Resolved eagerly from
    // a factory because the token exists specifically to give Nest something to inject; without a
    // provider for it the constructor argument is unresolvable again.
    { provide: MEDIA_RUNTIME_URL, useFactory: () => process.env.GO2RTC_URL_INTERNAL ?? process.env.GO2RTC_URL },
    MediaRuntimeService,
  ],
  exports: [OnvifDiscoveryService, MediaRuntimeService],
})
export class CameraMediaModule {}
