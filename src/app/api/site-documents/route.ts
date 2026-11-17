import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { logAgentError } from "@/server/agents/agent-request";
import { serverSupabase } from "@/server/config";
import { checkDocument, DOCUMENT_BUCKET, MAX_DOCUMENT_BYTES } from "@/server/site-documents/upload";

// One PDF of at most 4 MB: checked, stored and recorded.
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/**
 * Receives one PDF for a client's website (statutes, minutes). The person's
 * access is checked with their own session; only then does the server store
 * the file and record it.
 *
 * multipart/form-data: studioId, clientId, title, file.
 */
export async function POST(request: Request) {
  const supabase = serverSupabase();
  if (!supabase.ok) return error(503, supabase.reason);
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return error(401, "Sign in to add documents.");
  const form = await request.formData().catch(() => null);
  const studioId = form?.get("studioId");
  const clientId = form?.get("clientId");
  const file = form?.get("file");
  if (typeof studioId !== "string" || !UUID.test(studioId) || typeof clientId !== "string" || !UUID.test(clientId) || !(file instanceof Blob)) return error(400, "The request was not understood.");
  if (file.size > MAX_DOCUMENT_BYTES + 1024) return error(400, "The document is larger than 4 MB.");

  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const asUser = createClient(supabase.url, supabase.anonKey, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await asUser.auth.getUser(token);
  if (authError || !auth.user) return error(401, "Your session has ended. Sign in again to continue.");
  const { data: membership, error: membershipError } = await asUser.from("studio_members").select("role, display_name").eq("studio_id", studioId).eq("user_id", auth.user.id).maybeSingle();
  if (membershipError) return error(500, "Your access could not be checked. Try again.");
  if (!membership) return error(404, "This client does not exist, or you do not have access to it.");
  if (membership.role === "viewer") return error(403, "Viewers cannot add documents. Ask an owner for member access.");
  const { data: client } = await asUser.from("clients").select("id").eq("id", clientId).eq("studio_id", studioId).maybeSingle();
  if (!client) return error(404, "This client does not exist, or you do not have access to it.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = checkDocument(bytes, form?.get("title"));
  if (!checked.ok) return error(400, checked.message);

  const id = randomUUID();
  const storagePath = `${studioId}/${clientId}/${id}.pdf`;
  const actor = { kind: "human", name: String(membership.display_name ?? auth.user.email ?? "Studio member"), userId: auth.user.id };
  const asServer = createClient(supabase.url, supabase.serviceRoleKey, options);
  try {
    const { error: storeError } = await asServer.storage.from(DOCUMENT_BUCKET).upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
    if (storeError) throw storeError;
    const { error: recordError } = await asServer.rpc("record_site_document", {
      p_document: { id, studio_id: studioId, client_id: clientId, storage_path: storagePath, title: checked.title, byte_size: bytes.byteLength, sha256: checked.sha256, uploaded_by: actor },
    });
    if (recordError) throw recordError;
    return Response.json({ id, title: checked.title, byteSize: bytes.byteLength }, { status: 201 });
  } catch (failure) {
    logAgentError("Document upload failed", failure);
    return error(500, "The document could not be stored. Try again.");
  }
}
