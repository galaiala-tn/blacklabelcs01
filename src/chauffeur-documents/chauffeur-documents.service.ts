import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';

const BUCKET = 'chauffeur-documents';

@Injectable()
export class ChauffeurDocumentsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async uploadLicense(chauffeurId: string, file: Express.Multer.File) {
    const path = await this.upload(chauffeurId, 'license', file);
    await this.markPendingReview(chauffeurId, { license_document_url: path });
    return { path };
  }

  async uploadInsurance(chauffeurId: string, file: Express.Multer.File, expiry?: string) {
    const path = await this.upload(chauffeurId, 'insurance', file);
    await this.markPendingReview(chauffeurId, {
      insurance_document_url: path,
      insurance_expiry: expiry ?? null,
    });
    return { path };
  }

  private async upload(chauffeurId: string, kind: 'license' | 'insurance', file: Express.Multer.File) {
    const ext = file.originalname.split('.').pop() ?? 'pdf';
    const path = `${chauffeurId}/${kind}.${ext}`;

    const { error } = await this.supabase
      .getClient()
      .storage.from(BUCKET)
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: true });

    if (error) throw new BadRequestException(`Upload failed: ${error.message}`);
    return path;
  }

  /** Any new document upload resets verification to 'pending' — an admin must re-review. */
  private async markPendingReview(chauffeurId: string, extra: Record<string, unknown>) {
    await this.supabase
      .getClient()
      .from('chauffeurs')
      .update({ ...extra, verification_status: 'pending', verified_at: null, verified_by: null })
      .eq('id', chauffeurId);
  }

  async getDownloadUrl(chauffeurId: string, path: string) {
    const { data, error } = await this.supabase
      .getClient()
      .storage.from(BUCKET)
      .createSignedUrl(path, 60 * 10);

    if (error || !data) throw new BadRequestException('Could not create document link');
    return { url: data.signedUrl };
  }
}
