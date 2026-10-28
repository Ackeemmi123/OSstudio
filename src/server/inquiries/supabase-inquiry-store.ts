import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { InquiryStudioMissingError, type InquiryStore, type ReceiveResult } from "./receive";

const answer = z.discriminatedUnion("result", [
  z.object({ result: z.enum(["received", "duplicate"]), id: z.uuid() }),
  z.object({ result: z.literal("conflict") }),
  z.object({ result: z.literal("rate_limited"), retryAfter: z.int().positive() }),
]);

/**
 * Stores inquiries through receive_inquiry(), the only database access the
 * service role has for them. The call is one transaction: when it returns,
 * the inquiry is committed.
 */
export class SupabaseInquiryStore implements InquiryStore {
  constructor(private readonly asService: SupabaseClient) {}

  async receive(input: Parameters<InquiryStore["receive"]>[0]): Promise<ReceiveResult> {
    const { data, error } = await this.asService.rpc("receive_inquiry", {
      p_studio: input.studioId,
      p_inquiry: input.inquiry,
      p_content_hash: input.contentHash,
      p_ip_hash: input.ipHash,
    });
    if (error) {
      if (error.code === "SO404") throw new InquiryStudioMissingError();
      throw Object.assign(new Error(`receive_inquiry failed (${error.code ?? "no code"})`), { name: "InquiryStoreError" });
    }
    const parsed = answer.safeParse(data);
    if (!parsed.success) throw Object.assign(new Error("receive_inquiry returned an unexpected answer"), { name: "InquiryStoreError" });
    return parsed.data;
  }
}
