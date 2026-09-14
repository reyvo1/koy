import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { connect } from 'mqtt';
import { DeviceModule } from '../device/device.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  MQTT_CLIENT_FACTORY,
  MqttJsPublisherAdapter,
} from './mqtt-js-publisher.adapter';
import { MQTT_PUBLISHER_TRANSPORT } from './mqtt-publisher.transport';
import { MqttService } from './mqtt.service';
import { MqttWebhookController } from './mqtt.webhook.controller';

@Module({
  imports: [PrismaModule, ConfigModule, forwardRef(() => DeviceModule)],
  controllers: [MqttWebhookController],
  providers: [
    {
      provide: MQTT_CLIENT_FACTORY,
      useValue: connect,
    },
    MqttJsPublisherAdapter,
    {
      provide: MQTT_PUBLISHER_TRANSPORT,
      useExisting: MqttJsPublisherAdapter,
    },
    MqttService,
  ],
  exports: [MqttService],
})
export class MqttModule {}
