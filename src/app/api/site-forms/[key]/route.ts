import { createClient } from "@supabase/supabase-js";
import { formMailConfig, serverSupabase } from "@/server/config";
import { handleForm, sendWithResend, type FormTarget } from "@/server/publish/forms";

/** A message from a published site's form, mailed to the client. */
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const supabase = serverSupabase();
  const mail = formMailConfig();
  if (!supabase.ok || !mail.ok) return new Response("Not available.", { status: 503 });
  const db = createClient(supabase.url, supabase.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const form = await request.formData().catch(() => null);
  return handleForm((await params).key, form, {
    take: async (key) => {
      const { data, error } = await db.rpc("take_form_send", { p_key: key });
      if (error) throw error;
      return (data as FormTarget | null) ?? null;
    },
    send: (message) => sendWithResend(mail.apiKey, mail.from, message),
  });
}
