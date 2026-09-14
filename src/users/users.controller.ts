import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from './guards/tenant-context.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('profile')
  async getProfile(@Request() req) {
    return this.usersService.getProfile(req.user.userId);
  }

  @Post('profile')
  async updateProfile(@Request() req, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.userId, { name: dto.name });
  }

  @Get('tenant-context')
  @UseGuards(TenantContextGuard)
  async getTenantContext(@Request() req) {
      return req.user.tenantContext;
  }
}
