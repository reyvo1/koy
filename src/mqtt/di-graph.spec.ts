import { Test, TestingModule } from '@nestjs/testing';
import { DeviceModule } from '../device/device.module';
import { MqttModule } from '../mqtt/mqtt.module';
import { CommandService } from '../device/command.service';
import { MqttService } from '../mqtt/mqtt.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Dependency Injection Graph', () => {
    it('should resolve CommandService and MqttService dependencies', async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [DeviceModule, MqttModule],
            providers: [{ provide: PrismaService, useValue: {} }],
        }).compile();

        const commandService = module.get<CommandService>(CommandService);
        const mqttService = module.get<MqttService>(MqttService);

        expect(commandService).toBeDefined();
        expect(mqttService).toBeDefined();
    });
});
