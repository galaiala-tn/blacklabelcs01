import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, RegisterDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthenticatedUser } from './strategies/jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  // Returns the same shape as the `user` field from /auth/login (full DB
  // profile: full_name, email, phone, avatar_url, is_active, created_at).
  // Previously this returned the raw AuthenticatedUser from the JWT guard
  // (a different, incomplete, camelCase shape), which crashed the Flutter
  // app's UserProfile.fromJson() on cold start after a successful login.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.id);
  }

  @Get('test-supabase')
  testSupabase() {
    if (process.env.NODE_ENV === 'production') {
      return { message: 'Endpoint désactivé en production' };
    }
    return this.authService.testSupabase();
  }
}
