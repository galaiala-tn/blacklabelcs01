import { Module } from '@nestjs/common';
import { ChauffeurDocumentsController } from './chauffeur-documents.controller';
import { ChauffeurDocumentsService } from './chauffeur-documents.service';

@Module({
  controllers: [ChauffeurDocumentsController],
  providers: [ChauffeurDocumentsService],
})
export class ChauffeurDocumentsModule {}
