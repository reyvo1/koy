import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AdminRoleGuard } from './admin-role.guard';
import { PlatformRoleGuard } from './platform-role.guard';
import { AdminUserProvisioningService } from './admin-user-provisioning.service';
import {
  CreateOwnTenantUserDto,
  CreateTenantUserDto,
} from './dto/create-tenant-user.dto';
import {
  PlatformResetPasswordDto,
  PlatformUpdateUserDto,
  TenantResetPasswordDto,
  TenantUpdateUserDto,
} from './dto/admin-user-management.dto';
import { AdminOperationsRequest } from './admin-operational-summary.types';
import {
  DomainBadRequestException,
} from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';

@ApiTags('admin-operations')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant selector validated against active membership',
})
@Controller('admin')
export class AdminUserProvisioningController {
  constructor(
    private readonly provisioning: AdminUserProvisioningService,
  ) {}

  @Get('platform-users')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
  @ApiOperation({ summary: 'List users across all tenants (platform admin)' })
  @ApiResponse({ status: 403, description: 'PLATFORM_ADMIN required' })
  async listAllUsers() {
    return this.provisioning.listAllUsers();
  }

  @Post('platform-users')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
  @ApiOperation({ summary: 'Create a user in any tenant (platform admin)' })
  @ApiResponse({ status: 409, description: 'User already exists in tenant' })
  async createPlatformUser(@Body() dto: CreateTenantUserDto) {
    return this.provisioning.createUser({
      tenantId: dto.tenantId,
      email: dto.email,
      name: dto.name,
      password: dto.password,
      role: dto.role,
    });
  }

  @Get('tenant-users')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'List users of the active tenant (tenant admin)' })
  @ApiResponse({ status: 403, description: 'Active ADMIN membership required' })
  async listTenantUsers(@Request() request: AdminOperationsRequest) {
    return this.provisioning.listTenantUsers(
      request.user.tenantContext.tenantId,
    );
  }

  @Post('tenant-users')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'Create a user in the active tenant (tenant admin)' })
  @ApiResponse({ status: 409, description: 'User already exists in tenant' })
  async createTenantUser(
    @Request() request: AdminOperationsRequest,
    @Body() dto: CreateOwnTenantUserDto,
  ) {
    return this.provisioning.createUser({
      tenantId: request.user.tenantContext.tenantId,
      email: dto.email,
      name: dto.name,
      password: dto.password,
      role: dto.role,
    });
  }

  @Patch('platform-users/:userId')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
  @ApiOperation({ summary: 'Update user name/role/status in any tenant (platform admin)' })
  async updatePlatformUser(
    @Request() request: AdminOperationsRequest,
    @Param('userId') userId: string,
    @Body() dto: PlatformUpdateUserDto,
  ) {
    return this.provisioning.updateUser(
      { userId, tenantId: dto.tenantId },
      { name: dto.name, role: dto.role, status: dto.status },
      request.user.userId,
    );
  }

  @Delete('platform-users/:userId')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
  @ApiOperation({ summary: 'Delete a user from a tenant (platform admin)' })
  async deletePlatformUser(
    @Request() request: AdminOperationsRequest,
    @Param('userId') userId: string,
    @Query('tenantId') tenantId?: string,
  ) {
    if (!tenantId) {
      throw new DomainBadRequestException(
        ERROR_CODES.DashboardInvalidInput,
        'tenantId query parameter is required',
      );
    }
    return this.provisioning.deleteUser(
      { userId, tenantId },
      request.user.userId,
    );
  }

  @Post('platform-users/:userId/reset-password')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
  @ApiOperation({ summary: 'Reset a user password and revoke sessions (platform admin)' })
  async resetPlatformUserPassword(
    @Param('userId') userId: string,
    @Body() dto: PlatformResetPasswordDto,
  ) {
    return this.provisioning.resetPassword(
      { userId, tenantId: dto.tenantId },
      dto.password,
    );
  }

  @Patch('tenant-users/:userId')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'Update member name/role/status (tenant admin)' })
  async updateTenantUser(
    @Request() request: AdminOperationsRequest,
    @Param('userId') userId: string,
    @Body() dto: TenantUpdateUserDto,
  ) {
    return this.provisioning.updateUser(
      { userId, tenantId: request.user.tenantContext.tenantId },
      { name: dto.name, role: dto.role, status: dto.status },
      request.user.userId,
    );
  }

  @Delete('tenant-users/:userId')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'Delete a member (tenant admin)' })
  async deleteTenantUser(
    @Request() request: AdminOperationsRequest,
    @Param('userId') userId: string,
  ) {
    return this.provisioning.deleteUser(
      { userId, tenantId: request.user.tenantContext.tenantId },
      request.user.userId,
    );
  }

  @Post('tenant-users/:userId/reset-password')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'Reset a member password and revoke sessions (tenant admin)' })
  async resetTenantUserPassword(
    @Request() request: AdminOperationsRequest,
    @Param('userId') userId: string,
    @Body() dto: TenantResetPasswordDto,
  ) {
    return this.provisioning.resetPassword(
      { userId, tenantId: request.user.tenantContext.tenantId },
      dto.password,
    );
  }
}
