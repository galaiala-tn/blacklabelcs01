import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ChatService } from './chat.service';
import { SendChatMessageDto } from './dto/chat.dto';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('messages')
  send(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendChatMessageDto) {
    return this.chatService.sendMessage(user, dto);
  }

  @Get('reservations/:id/messages')
  history(@CurrentUser() user: AuthenticatedUser, @Param('id') reservationId: string) {
    return this.chatService.getHistory(reservationId, user);
  }

  @Patch('reservations/:id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') reservationId: string) {
    return this.chatService.markRead(reservationId, user);
  }
}
