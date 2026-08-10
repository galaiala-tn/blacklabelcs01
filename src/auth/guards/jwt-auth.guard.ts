import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Apply with @UseGuards(JwtAuthGuard) on any route that requires a logged-in user. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
