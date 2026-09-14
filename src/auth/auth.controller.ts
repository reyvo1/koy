import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) { return this.authService.register(dto); }

  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) { return this.authService.verifyEmail(dto.token); }

  @Post('login')
  async login(@Body() dto: LoginDto) { return this.authService.login(dto); }

  @Post('refresh')
  async refresh(@Body('token') token: string) { return this.authService.refreshTokens(token); }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Request() req: any) { return this.authService.logout(req.user.userId, req.user.tenantId); }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) { return this.authService.forgotPassword(dto.email, dto.tenantId); }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) { return this.authService.resetPassword(dto.token, dto.password); }
}
