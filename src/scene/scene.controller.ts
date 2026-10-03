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
import { RbacAuditService } from '../rbac/rbac-audit.service';
import { SceneAccessService } from './scene-access.service';
import type { DeviceAccessContext } from '../device/device-access.service';

@Controller('scenes')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class SceneController {
  constructor(
    private readonly scenes: SceneRepository,
    private readonly execution: SceneExecutionService,
    private readonly audit: RbacAuditService,
    private readonly access: SceneAccessService,
  ) {}

  private accessContext(request: any): DeviceAccessContext {
    return {
      tenantId: request.user.tenantContext.tenantId,
      membershipId: request.user.tenantContext.membershipId,
      userId: request.user.userId,
      role: request.user.tenantContext.role,
    };
  }

  /**
   * Records who changed a scene after device-level authorization succeeds.
   *
   * `Scene` has no owner column, so authorization is derived from the devices referenced by its
   * actions. VIEW is required to read a scene; CONTROL is required to create, run, enable,
   * disable, or delete one. The audit row records that concrete boundary.
   */
  private recordSceneMutation(
    request: any,
    sceneId: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
  ): void {
    const { tenantId, membershipId } = request.user.tenantContext;
    void this.audit.recordMutation({
      tenantId,
      membershipId,
      resourceType: 'scene',
      resourceId: sceneId,
      action,
      detail:
        'permitted after tenant membership plus device-level CONTROL authorization',
    });
  }

  @Post()
  async create(@Request() request: any, @Body() body: unknown) {
    const input = validateCreateSceneInput(body);
    await this.access.assertDeviceAccess(this.accessContext(request), input.actions.map((action) => action.deviceId), 'CONTROL');
    try {
      const created = await this.scenes.createScene(
        request.user.tenantContext.tenantId,
        input,
      );
      this.recordSceneMutation(
        request,
        typeof created === 'string' ? created : (created as { id: string }).id,
        'CREATE',
      );
      return created;
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
    const scenes = await this.scenes.listTenantScenes(request.user.tenantContext.tenantId);
    return this.access.filterReadableScenes(this.accessContext(request), scenes);
  }

  @Get(':sceneId')
  async get(
    @Request() request: any,
    @Param('sceneId') sceneId: string,
  ) {
    const scene = await this.scenes.findTenantScene(request.user.tenantContext.tenantId, sceneId);
    await this.access.assertSceneAccess(this.accessContext(request), scene, 'VIEW');
    return scene;
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
    const scene = await this.scenes.findTenantScene(request.user.tenantContext.tenantId, sceneId);
    await this.access.assertSceneAccess(this.accessContext(request), scene, 'CONTROL');
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
    const scene = await this.scenes.findTenantScene(request.user.tenantContext.tenantId, sceneId);
    await this.access.assertSceneAccess(this.accessContext(request), scene, 'VIEW');
    return this.scenes.listSceneExecutions(
      request.user.tenantContext.tenantId,
      sceneId,
      Math.min(Math.max(limit, 1), 100),
    );
  }

  @Delete(':sceneId')
  async remove(@Request() request: any, @Param('sceneId') sceneId: string) {
    const scene = await this.scenes.findTenantScene(request.user.tenantContext.tenantId, sceneId);
    await this.access.assertSceneAccess(this.accessContext(request), scene, 'CONTROL');
    this.recordSceneMutation(request, sceneId, 'DELETE');
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
    const scene = await this.scenes.findTenantScene(request.user.tenantContext.tenantId, sceneId);
    await this.access.assertSceneAccess(this.accessContext(request), scene, 'CONTROL');
    this.recordSceneMutation(request, sceneId, 'UPDATE');
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
