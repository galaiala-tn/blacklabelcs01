import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AppRole } from '../common/enums';
import { ChauffeurDocumentsService } from './chauffeur-documents.service';

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.CHAUFFEUR)
@Controller('chauffeur-documents')
export class ChauffeurDocumentsController {
  constructor(private readonly documentsService: ChauffeurDocumentsService) {}

  @Post('license')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE_BYTES } }))
  uploadLicense(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.documentsService.uploadLicense(user.id, file);
  }

  @Post('insurance')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE_BYTES } }))
  uploadInsurance(
    @CurrentUser() user: AuthenticatedUser,
    @Body('expiry') expiry: string | undefined,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.documentsService.uploadInsurance(user.id, file, expiry);
  }
}
