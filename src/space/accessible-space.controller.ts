import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AccessibleSpaceService } from './accessible-space.service';

interface UserWorkspaceRequest {
  user: {
    userId: string;
    tenantContext: {
      tenantId: string;
      membershipId: string;
      role: string;
    };
  };
}

/**
 * User-safe space read surface. Unlike the administrative /spaces endpoints,
 * this route does not grant mutation access and never exposes a device merely
 * because it is placed in a room.
 */
@ApiTags('spaces')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant selector validated against active membership',
})
@Controller('spaces')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class AccessibleSpaceController {
  constructor(private readonly accessibleSpaces: AccessibleSpaceService) {}

  @Get('accessible')
  @ApiOperation({
    summary: 'List room-centric devices authorized by owner/share VIEW/CONTROL',
  })
  @ApiResponse({ status: 200, description: 'Authorized room/device read model' })
  async read(@Request() request: UserWorkspaceRequest) {
    return this.accessibleSpaces.read({
      tenantId: request.user.tenantContext.tenantId,
      membershipId: request.user.tenantContext.membershipId,
      userId: request.user.userId,
      role: request.user.tenantContext.role,
    });
  }
}
