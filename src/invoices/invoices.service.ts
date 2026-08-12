import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * pdf_url stores the STORAGE PATH (e.g. "INV-2026-000123.pdf"), not a
 * permanent public URL — the bucket is private, so callers must request a
 * fresh signed URL via InvoicesService.getDownloadUrl() / GET /invoices/:id/download.
 */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);
  private readonly bucket: string;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {
    this.bucket = this.config.get<string>('storage.invoicesBucket') ?? 'invoices';
  }

  /** Called when a reservation transitions to 'completed' (see ReservationsService). */
  async generateForReservation(reservationId: string) {
    const client = this.supabase.getClient();

    const { data: reservation, error } = await client
      .from('reservations')
      .select(
        '*, customers:customer_id(id, profiles:id(full_name, email)), vehicle_categories(display_name)',
      )
      .eq('id', reservationId)
      .single();

    if (error || !reservation) throw new NotFoundException('Reservation not found');

    const { data: existing } = await client
      .from('invoices')
      .select('id')
      .eq('reservation_id', reservationId)
      .maybeSingle();
    if (existing) return existing; // idempotent — don't double-invoice

    const subtotal = Number(reservation.subtotal);
    const totalAmount = Number(reservation.total_price);
    const taxAmount = round2(totalAmount - subtotal);

    // Insert first (invoice_number is auto-assigned by the DB trigger from Phase 1).
    const { data: invoice, error: insertError } = await client
      .from('invoices')
      .insert({
        reservation_id: reservationId,
        customer_id: reservation.customer_id,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        currency: 'USD',
      })
      .select()
      .single();

    if (insertError || !invoice) {
      throw new BadRequestException(insertError?.message ?? 'Could not create invoice record');
    }

    const customerName = reservation.customers?.profiles?.full_name ?? 'Customer';
    const customerEmail = reservation.customers?.profiles?.email ?? '';
    const categoryName = reservation.vehicle_categories?.display_name ?? '';

    const pdfBuffer = await this.renderPdf({
      invoiceNumber: invoice.invoice_number,
      issuedAt: invoice.issued_at,
      customerName,
      customerEmail,
      categoryName,
      reservationReference: reservation.reference_code,
      pickupAddress: reservation.pickup_address,
      destinationAddress: reservation.destination_address,
      distanceKm: reservation.distance_km,
      bookedHours: reservation.booked_hours,
      basePrice: Number(reservation.base_price),
      stopsPrice: Number(reservation.stops_price),
      optionsPrice: Number(reservation.options_price),
      subtotal,
      taxAmount,
      totalAmount,
    });

    const path = `${invoice.invoice_number}.pdf`;
    const { error: uploadError } = await client.storage
      .from(this.bucket)
      .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true });

    if (uploadError) {
      this.logger.error(`Invoice PDF upload failed: ${uploadError.message}`);
    } else {
      await client.from('invoices').update({ pdf_url: path }).eq('id', invoice.id);
    }

    return { ...invoice, pdf_url: path };
  }

  async listForCustomer(customerId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('invoices')
      .select('*')
      .eq('customer_id', customerId)
      .order('issued_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /** Admin-wide view — every invoice, with customer name for display. */
  async listAll() {
  const { data, error } = await this.supabase
    .getClient()
    .from('invoices')
    .select('*, customers!invoices_customer_id_fkey(profiles!customers_id_fkey(full_name, email))')
    .order('issued_at', { ascending: false });

  if (error) throw new BadRequestException(error.message);
  return data;
}

  /** Returns a time-limited signed URL to download the invoice PDF. */
  async getDownloadUrl(invoiceId: string, requestingCustomerId?: string) {
    const client = this.supabase.getClient();

    const { data: invoice, error } = await client
      .from('invoices')
      .select('id, customer_id, pdf_url')
      .eq('id', invoiceId)
      .single();

    if (error || !invoice) throw new NotFoundException('Invoice not found');
    if (requestingCustomerId && invoice.customer_id !== requestingCustomerId) {
      throw new BadRequestException('This invoice does not belong to you');
    }
    if (!invoice.pdf_url) throw new BadRequestException('Invoice PDF is not ready yet');

    const { data: signed, error: signError } = await client.storage
      .from(this.bucket)
      .createSignedUrl(invoice.pdf_url, 60 * 10); // 10 minutes

    if (signError || !signed) throw new BadRequestException('Could not create download link');

    return { url: signed.signedUrl };
  }

  private async renderPdf(fields: {
    invoiceNumber: string;
    issuedAt: string;
    customerName: string;
    customerEmail: string;
    categoryName: string;
    reservationReference: string;
    pickupAddress: string;
    destinationAddress: string | null;
    distanceKm: number | null;
    bookedHours: number | null;
    basePrice: number;
    stopsPrice: number;
    optionsPrice: number;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header — black & gold theme reflected in the PDF too
      doc.rect(0, 0, doc.page.width, 90).fill('#0B0B0B');
      doc
        .fillColor('#D4AF37')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('BLACKLABEL', 50, 30)
        .fontSize(10)
        .fillColor('#CFCFCF')
        .font('Helvetica')
        .text('CAR SERVICES', 50, 58);

      doc.fillColor('#000000');
      doc.moveDown(4);

      doc.fontSize(16).font('Helvetica-Bold').text(`Invoice ${fields.invoiceNumber}`, { align: 'right' });
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(`Issued: ${new Date(fields.issuedAt).toLocaleDateString()}`, { align: 'right' })
        .text(`Reservation: ${fields.reservationReference}`, { align: 'right' });

      doc.moveDown(1.5);
      doc.fontSize(11).font('Helvetica-Bold').text('Billed to');
      doc.font('Helvetica').text(fields.customerName).text(fields.customerEmail);

      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').text('Trip details');
      doc.font('Helvetica');
      doc.text(`Vehicle category: ${fields.categoryName}`);
      doc.text(`Pickup: ${fields.pickupAddress}`);
      if (fields.destinationAddress) doc.text(`Destination: ${fields.destinationAddress}`);
      if (fields.distanceKm) doc.text(`Distance: ${fields.distanceKm} km`);
      if (fields.bookedHours) doc.text(`Duration: ${fields.bookedHours} hours`);

      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').text('Charges');
      doc.font('Helvetica');
      this.lineItem(doc, 'Base fare', fields.basePrice);
      if (fields.stopsPrice > 0) this.lineItem(doc, 'Intermediate stops', fields.stopsPrice);
      if (fields.optionsPrice > 0) this.lineItem(doc, 'Options (Meet & Greet, etc.)', fields.optionsPrice);
      doc.moveDown(0.3);
      this.lineItem(doc, 'Subtotal', fields.subtotal);
      this.lineItem(doc, 'Service & tax', fields.taxAmount);

      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(13);
      this.lineItem(doc, 'Total', fields.totalAmount);

      doc.moveDown(3);
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#777777')
        .text('Thank you for choosing BlackLabel Car Services.', { align: 'center' });

      doc.end();
    });
  }

  private lineItem(doc: PDFKit.PDFDocument, label: string, amount: number) {
    const y = doc.y;
    doc.text(label, 50, y);
    doc.text(`$${amount.toFixed(2)}`, 0, y, { align: 'right' });
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
