import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validate } from './config/config.validation';
import { createLoggerConfig } from './config/logger.config';
import { RedisModule } from './redis/redis.module';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DeviceModule } from './device/device.module';
import { CameraOnboardingModule } from './device/camera-onboarding.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { MqttModule } from './mqtt/mqtt.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MetricsModule } from './metrics/metrics.module';
import { SensitiveEndpointRateLimitGuard } from './security/sensitive-endpoint-rate-limit.guard';
import { AdminOperationsModule } from './admin-operations/admin-operations.module';
import { AutomationModule } from './automation/automation.module';
import { NotificationModule } from './notification/notification.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { OrgModule } from './org/org.module';
import { OtaModule } from './ota/ota.module';
import { BillingModule } from './billing/billing.module';
import { PublicApiModule } from './public-api/public-api.module';
import { RbacModule } from './rbac/rbac.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SharingModule } from './sharing/sharing.module';
import { SpaceModule } from './space/space.module';
import { SceneModule } from './scene/scene.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate,
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    LoggerModule.forRoot(createLoggerConfig()),
    MetricsModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    DeviceModule,
    CameraOnboardingModule,
    DashboardModule,
    AutomationModule,
    SceneModule,
    SchedulerModule,
    RbacModule,
    PublicApiModule,
    BillingModule,
    SpaceModule,
    SharingModule,
    NotificationModule,
    OtaModule,
    IntegrationsModule,
    OrgModule,
    AnalyticsModule,
    AdminOperationsModule,
    MqttModule,
    TelemetryModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: SensitiveEndpointRateLimitGuard,
    },
  ],
})
export class AppModule {}
