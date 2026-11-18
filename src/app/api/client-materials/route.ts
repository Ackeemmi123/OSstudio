import { randomUUID } from "node:crypto";
import { logAgentError } from "@/server/agents/agent-request";
import { materialAccess } from "@/server/client-materials/access";
import { docxText } from "@/server/client-materials/docx";
import { checkMaterial, MATERIAL_BUCKET, MAX_MATERIAL_BYTES, splitText } from "@/server/client-materials/files";

// One file of at most 4 MB: read or checked, then stored.
export const maxDuration = 30;

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/**
 * Receives one file a client sent. A Word document is read into text and
 * returned in source-sized parts for the person to keep as sources; a PDF or
 * an image is checked and kept as a file for the AI draft.
 *
 * multipart/form-data: studioId, clientId, title, file.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const access = await materialAccess(request, form?.get("studioId"), form?.get("clientId"));
  if (!access.ok) return access.response;
  const file = form?.get("file");
  if (!(file instanceof Blob)) return error(400, "The request was not understood.");
  if (file.size > MAX_MATERIAL_BYTES + 1024) return error(400, "The file is larger than 4 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const title = String(form?.get("title") ?? "").trim();

  const words = docxText(bytes);
  if (words !== null) {
    if (!words) return error(400, "No text was found in the Word document.");
    return Response.json({ kind: "text", title: title || "Word document", parts: splitText(words) });
  }

  const checked = checkMaterial(bytes, title);
  if (!checked.ok) return error(400, checked.message);
  const studioId = String(form?.get("studioId"));
  const clientId = String(form?.get("clientId"));
  const id = randomUUID();
  const extension = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[checked.type];
  const storagePath = `${studioId}/${clientId}/${id}.${extension}`;
  try {
    const { error: storeError } = await access.asServer.storage.from(MATERIAL_BUCKET).upload(storagePath, bytes, { contentType: checked.type, upsert: false });
    if (storeError) throw storeError;
    const { error: recordError } = await access.asServer.rpc("record_client_material", {
      p_material: { id, studio_id: studioId, client_id: clientId, storage_path: storagePath, title: checked.title, mime_type: checked.type, byte_size: bytes.byteLength, sha256: checked.sha256, added_by: access.actor },
    });
    if (recordError) throw recordError;
    return Response.json({ kind: "file", id, title: checked.title, mimeType: checked.type, byteSize: bytes.byteLength }, { status: 201 });
  } catch (failure) {
    logAgentError("Material upload failed", failure);
    return error(500, "The file could not be stored. Try again.");
  }
}
