import { createClient } from "@supabase/supabase-js";
import { inquiryConfig } from "@/server/config";
import { handleInquiryRequest } from "@/server/inquiries/receive";
import { SupabaseInquiryStore } from "@/server/inquiries/supabase-inquiry-store";

export const maxDuration = 15;

/**
 * Receives an inquiry from the Axivo website's server (handoff contract v1).
 * Signed server-to-server only: there are no CORS headers, so a browser page
 * cannot use it, and the signing secret never leaves the two servers.
 */
export async function POST(request: Request) {
  const config = inquiryConfig();
  const store = config.ok
    ? new SupabaseInquiryStore(
        createClient(config.value.supabase.url, config.value.supabase.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }),
      )
    : null;
  return handleInquiryRequest(request, { config, store, now: () => new Date() });
}
