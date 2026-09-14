import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { validateCreateSceneInput } from './scene-domain.validator';
import { SceneExecutionService } from './scene-execution.service';
import {
  SceneRepository,
  ScenePersistenceError,
  SCENE_PERSISTENCE_ERROR_CODES,
} from './scene.repository';
import { DomainConflictException, DomainNotFoundException } from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';

@Controller('scenes')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class SceneController {
  constructor(
    private readonly scenes: SceneRepository,
    private readonly execution: SceneExecutionService,
  ) {}

  @Post()
  async create(@Request() request: any, @Body() body: unknown) {
    const input = validateCreateSceneInput(body);
    try {
      return await this.scenes.createScene(
        request.user.tenantContext.tenantId,
        input,
      );
    } catch (cause) {
      if (
        cause instanceof ScenePersistenceError &&
        cause.code === SCENE_PERSISTENCE_ERROR_CODES.NameConflict
      ) {
        throw new DomainConflictException(
          ERROR_CODES.Conflict,
          'Nama scene sudah dipakai — pilih nama lain',
        );
      }
      throw cause;
    }
  }

  @Get()
  async list(@Request() request: any) {
    return this.scenes.listTenantScenes(
      request.user.tenantContext.tenantId,
    );
  }

  @Get(':sceneId')
  async get(
    @Request() request: any,
    @Param('sceneId') sceneId: string,
  ) {
    return this.scenes.findTenantScene(
      request.user.tenantContext.tenantId,
      sceneId,
    );
  }

  @Post(':sceneId/run')
  @HttpCode(HttpStatus.OK)
  async run(
    @Request() request: any,
    @Param('sceneId') sceneId: string,
    @Body() body: { requestId?: string; mode?: 'ORDERED' | 'PARALLEL' },
  ) {
    const requestId =
      typeof body?.requestId === 'string' && body.requestId.trim()
        ? body.requestId.trim()
        : `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      return await this.execution.runScene({
        tenantId: request.user.tenantContext.tenantId,
        sceneId,
        requestId,
        mode: body?.mode === 'PARALLEL' ? 'PARALLEL' : 'ORDERED',
      });
    } catch (cause) {
      if (cause instanceof ScenePersistenceError) {
        if (
          cause.code === SCENE_PERSISTENCE_ERROR_CODES.SceneNotFound ||
          cause.code === SCENE_PERSISTENCE_ERROR_CODES.ExecutionNotFound
        ) {
          throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Scene tidak ditemukan');
        }
        if (cause.code === SCENE_PERSISTENCE_ERROR_CODES.InvalidInput) {
          throw new DomainConflictException(
            ERROR_CODES.Conflict,
            'Scene nonaktif — aktifkan scene dulu sebelum dijalankan',
          );
        }
      }
      throw cause;
    }
  }

  @Get(':sceneId/executions')
  async history(
    @Request() request: any,
    @Param('sceneId') sceneId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.scenes.listSceneExecutions(
      request.user.tenantContext.tenantId,
      sceneId,
      Math.min(Math.max(limit, 1), 100),
    );
  }

  @Delete(':sceneId')
  async remove(@Request() request: any, @Param('sceneId') sceneId: string) {
    const deleted = await this.scenes.deleteTenantScene(
      request.user.tenantContext.tenantId,
      sceneId,
    );
    if (!deleted) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Scene tidak ditemukan');
    }
    return { id: sceneId, deleted: true };
  }

  @Patch(':sceneId')
  async setEnabled(
    @Request() request: any,
    @Param('sceneId') sceneId: string,
    @Body() body: { enabled?: boolean },
  ) {
    const updated = await this.scenes.setTenantSceneEnabled(
      request.user.tenantContext.tenantId,
      sceneId,
      Boolean(body?.enabled),
    );
    if (!updated) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Scene tidak ditemukan');
    }
    return { id: sceneId, enabled: Boolean(body?.enabled) };
  }
}
