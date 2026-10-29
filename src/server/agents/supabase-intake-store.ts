import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentRunRecord } from "@/lib/agents/contract";
import { toAgentRun, toSnapshot, type StudioPayload } from "@/lib/data/supabase-rows";
import type { BudgetReservation, IntakeStore, NewRun, RunPatch } from "./intake-runner";

const AGENT_ACTOR = { kind: "agent", agentId: "research" } as const;

/**
 * Storage for the intake runner.
 *
 * Reads use the requesting person's session, so row-level security decides
 * what the agent may see. Writes use the service role, restricted here to
 * agent runs, proposals and activity, and the database triggers still stop
 * it from confirming facts, approving work or acting as a person.
 */
export class SupabaseIntakeStore implements IntakeStore {
  constructor(
    private readonly asUser: SupabaseClient,
    private readonly asRunner: SupabaseClient,
    private readonly studioId: string,
  ) {}

  async loadClient(clientId: string) {
    const [client, fields, items, sources] = await Promise.all([
      this.asUser.from("clients").select("*").eq("studio_id", this.studioId).eq("id", clientId).maybeSingle(),
      this.asUser.from("client_context_fields").select("*").eq("studio_id", this.studioId).eq("client_id", clientId),
      this.asUser.from("client_context_items").select("*").eq("studio_id", this.studioId).eq("client_id", clientId),
      this.asUser.from("client_sources").select("*").eq("studio_id", this.studioId).eq("client_id", clientId),
    ]);
    for (const result of [client, fields, items, sources]) if (result.error) throw result.error;
    if (!client.data) return null;
    const snapshot = toSnapshot({
      clients: [client.data],
      context_fields: fields.data ?? [],
      context_items: items.data ?? [],
      sources: sources.data ?? [],
      projects: [],
      tasks: [],
      activity: [],
      agent_runs: [],
      proposals: [],
    } as unknown as StudioPayload);
    return { client: snapshot.clients[0], sources: snapshot.sources };
  }

  async runsFor(idempotencyKey: string): Promise<AgentRunRecord[]> {
    const { data, error } = await this.asRunner
      .from("agent_runs")
      .select("*")
      .eq("studio_id", this.studioId)
      .eq("idempotency_key", idempotencyKey)
      .order("attempt", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toAgentRun);
  }

  async activeRun(clientId: string): Promise<AgentRunRecord | null> {
    const { data, error } = await this.asRunner
      .from("agent_runs")
      .select("*")
      .eq("studio_id", this.studioId)
      .eq("client_id", clientId)
      .eq("agent", "research")
      .in("status", ["queued", "running"])
      .maybeSingle();
    if (error) throw error;
    return data ? toAgentRun(data) : null;
  }

  async runsSince(isoTime: string): Promise<number> {
    const { count, error } = await this.asRunner
      .from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", this.studioId)
      .gte("created_at", isoTime);
    if (error) throw error;
    return count ?? 0;
  }

  async insertRun(run: NewRun): Promise<AgentRunRecord | null> {
    const now = new Date().toISOString();
    const { data, error } = await this.asRunner
      .from("agent_runs")
      .insert({
        studio_id: this.studioId,
        client_id: run.clientId,
        agent: "research",
        task_type: "research.intake",
        idempotency_key: run.idempotencyKey,
        attempt: run.attempt,
        status: run.status,
        trigger: { kind: "manual", requestedBy: run.requestedBy },
        inputs: run.inputs,
        runner: run.runner,
        model: run.model,
        prompt_version: run.promptVersion,
        blocker: run.blocker,
        requested_by: run.requestedBy,
        started_at: now,
        finished_at: run.status === "running" ? null : now,
      })
      .select()
      .single();
    if (error?.code === "23505") return null;
    if (error) throw error;
    return toAgentRun(data);
  }

  async finishRun(runId: string, patch: RunPatch): Promise<AgentRunRecord> {
    const { data, error } = await this.asRunner
      .from("agent_runs")
      .update({
        status: patch.status,
        result: patch.result ?? null,
        outputs: patch.outputs ?? [],
        error: patch.error ?? null,
        finished_at: new Date().toISOString(),
        ...(patch.spend
          ? {
              served_by: patch.spend.servedBy,
              input_tokens: patch.spend.usage.inputTokens,
              output_tokens: patch.spend.usage.outputTokens,
              cache_read_tokens: patch.spend.usage.cacheReadTokens,
              cache_write_tokens: patch.spend.usage.cacheWriteTokens,
              cost_micros: patch.spend.costMicros,
            }
          : {}),
      })
      .eq("studio_id", this.studioId)
      .eq("id", runId)
      .select()
      .single();
    if (error) throw error;
    return toAgentRun(data);
  }

  async supersedePending(clientId: string): Promise<void> {
    const { error } = await this.asRunner
      .from("agent_proposals")
      .update({ status: "superseded" })
      .eq("studio_id", this.studioId)
      .eq("client_id", clientId)
      .eq("status", "pending");
    if (error) throw error;
  }

  async insertProposals(runId: string, clientId: string, proposals: { target: string; value: string; evidence: unknown; note: string | null }[]) {
    if (proposals.length === 0) return [];
    const { data, error } = await this.asRunner
      .from("agent_proposals")
      .insert(proposals.map((p) => ({ studio_id: this.studioId, run_id: runId, client_id: clientId, target: p.target, value: p.value, evidence: p.evidence, note: p.note })))
      .select("id");
    if (error) throw error;
    return (data ?? []).map((row) => String(row.id));
  }

  async recordEvent(clientId: string, eventType: string, description: string): Promise<void> {
    const { error } = await this.asRunner.from("activity_events").insert({
      id: crypto.randomUUID(),
      studio_id: this.studioId,
      entity_type: "client",
      entity_id: clientId,
      event_type: eventType,
      description,
      actor: AGENT_ACTOR,
    });
    if (error) throw error;
  }

  async reserveBudget(runId: string, amountMicros: number, capMicros: number): Promise<BudgetReservation> {
    const { data, error } = await this.asRunner.rpc("ai_budget_reserve", { p_run: runId, p_amount: amountMicros, p_cap: capMicros });
    if (error) throw error;
    const result = data as { ok: boolean; spent?: number; reserved?: number };
    return result.ok ? { ok: true } : { ok: false, spentMicros: Number(result.spent ?? 0), reservedMicros: Number(result.reserved ?? 0) };
  }

  async settleBudget(runId: string, chargedMicros: number | null): Promise<void> {
    const { error } = await this.asRunner.rpc("ai_budget_settle", { p_run: runId, p_charged: chargedMicros });
    if (error) throw error;
  }
}
