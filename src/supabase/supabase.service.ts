import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Thin wrapper around the Supabase JS client, instantiated once with the
 * SERVICE ROLE key. This bypasses Row Level Security — the NestJS API is
 * the trusted backend, so authorization is enforced here (guards/roles),
 * not by RLS, for anything going through this client.
 *
 * The Flutter apps talk to Supabase directly (with the user's JWT) for
 * simple reads, where RLS from Phase 1 still applies.
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private client!: SupabaseClient;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('supabase.url');
    const serviceRoleKey = this.config.get<string>('supabase.serviceRoleKey');

    this.logger.log(`SUPABASE_URL: ${url}`);
    this.logger.log(`SERVICE_ROLE exists: ${!!serviceRoleKey}`);
    this.logger.log(`SERVICE_ROLE length: ${serviceRoleKey?.length}`);

    if (!url || !serviceRoleKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example).',
      );
    }

    this.client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  /** Full access client (service role). Use for all table reads/writes from services. */
  getClient(): SupabaseClient {
    return this.client;
  }
}