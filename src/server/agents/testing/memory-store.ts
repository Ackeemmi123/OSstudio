/**
 * An in-memory store for runner tests that behaves like the database: one
 * active run per client and agent, and a monthly budget ledger with the same
 * rules as public.ai_budget_reserve and ai_budget_settle. Stores made with
 * `forAgent` share runs and the ledger, as agents share one database.
 */
import type { AgentRunRecord, AgentTaskType } from "@/lib/agents/contract";
import type { AgentId, Client, SourceDocument } from "@/lib/domain/types";
import type { IntakeStore, NewRun, RunPatch } from "../intake-runner";

export const NOW = Date.parse("2026-10-27T12:00:00.000Z");

interface Shared {
  runs: AgentRunRecord[];
  spentMicros: number;
  reservedMicros: number;
  reservations: Map<string, { reserved: number; charged: number | null }>;
}

export class MemoryStore implements IntakeStore {
  proposals: { id: string; runId: string; target: string; value: string; status: string }[] = [];
  events: string[] = [];
  extraRunsThisHour = 0;
  /** More clients in the same studio, without sources. */
  otherClients: Client[] = [];
  private shared: Shared = { runs: [], spentMicros: 0, reservedMicros: 0, reservations: new Map() };

  constructor(
    public client: Client | null,
    public sources: SourceDocument[] = [],
    private readonly agent: { id: AgentId; taskType: AgentTaskType } = { id: "research", taskType: "research.intake" },
  ) {}

  /** A store for another agent on the same data and ledger. */
  forAgent(agent: { id: AgentId; taskType: AgentTaskType }): MemoryStore {
    const other = new MemoryStore(this.client, this.sources, agent);
    other.shared = this.shared;
    other.otherClients = this.otherClients;
    return other;
  }

  get runs() {
    return this.shared.runs;
  }
  get spentMicros() {
    return this.shared.spentMicros;
  }
  set spentMicros(value: number) {
    this.shared.spentMicros = value;
  }
  get reservedMicros() {
    return this.shared.reservedMicros;
  }
  get reservations() {
    return this.shared.reservations;
  }

  async loadClient(clientId: string) {
    if (this.client && this.client.id === clientId) return { client: this.client, sources: this.sources };
    const other = this.otherClients.find((client) => client.id === clientId);
    return other ? { client: other, sources: [] } : null;
  }
  async runsFor(key: string) {
    return this.runs.filter((run) => run.idempotencyKey === key).sort((a, b) => a.attempt - b.attempt);
  }
  async activeRun(clientId: string) {
    return this.runs.find((run) => run.clientId === clientId && run.agentId === this.agent.id && (run.status === "running" || run.status === "queued")) ?? null;
  }
  async runsSince() {
    return this.runs.length + this.extraRunsThisHour;
  }
  async insertRun(run: NewRun) {
    if (run.status === "running" && (await this.activeRun(run.clientId))) return null;
    const stamp = new Date(NOW).toISOString();
    const record: AgentRunRecord = {
      id: `run-${this.runs.length + 1}`,
      agentId: this.agent.id,
      taskType: this.agent.taskType,
      clientId: run.clientId,
      projectId: null,
      taskId: null,
      idempotencyKey: run.idempotencyKey,
      attempt: run.attempt,
      status: run.status,
      trigger: { kind: "manual", requestedBy: run.requestedBy },
      inputs: run.inputs,
      outputs: [],
      result: null,
      blocker: run.blocker,
      error: null,
      runner: run.runner,
      model: run.model,
      promptVersion: run.promptVersion,
      servedBy: null,
      usage: null,
      costMicros: null,
      createdAt: stamp,
      startedAt: stamp,
      finishedAt: run.status === "running" ? null : stamp,
    };
    this.runs.push(record);
    return record;
  }
  async finishRun(runId: string, patch: RunPatch) {
    const run = this.runs.find((r) => r.id === runId)!;
    Object.assign(run, { status: patch.status, result: patch.result ?? null, outputs: patch.outputs ?? [], error: patch.error ?? null, finishedAt: new Date(NOW).toISOString() });
    if (patch.spend) Object.assign(run, { usage: patch.spend.usage, servedBy: patch.spend.servedBy, costMicros: patch.spend.costMicros });
    return run;
  }
  async reserveBudget(runId: string, amount: number, cap: number) {
    if (this.runs.find((r) => r.id === runId)?.status !== "running") throw new Error("Only a running agent run can reserve budget.");
    if (this.reservations.has(runId)) return { ok: true as const };
    if (this.spentMicros + this.reservedMicros >= cap || this.spentMicros + this.reservedMicros + amount > cap) {
      return { ok: false as const, spentMicros: this.spentMicros, reservedMicros: this.reservedMicros };
    }
    this.reservations.set(runId, { reserved: amount, charged: null });
    this.shared.reservedMicros += amount;
    return { ok: true as const };
  }
  async settleBudget(runId: string, charged: number | null) {
    const reservation = this.reservations.get(runId);
    if (!reservation || reservation.charged !== null) return;
    reservation.charged = charged ?? reservation.reserved;
    this.shared.reservedMicros -= reservation.reserved;
    this.shared.spentMicros += reservation.charged;
  }
  async supersedePending(clientId: string) {
    for (const proposal of this.proposals) {
      const run = this.runs.find((r) => r.id === proposal.runId);
      if (run?.clientId === clientId && proposal.status === "pending") proposal.status = "superseded";
    }
  }
  async insertProposals(runId: string, _clientId: string, drafts: { target: string; value: string }[]) {
    return drafts.map((draft) => {
      const id = `proposal-${this.proposals.length + 1}`;
      this.proposals.push({ id, runId, target: draft.target, value: draft.value, status: "pending" });
      return id;
    });
  }
  async recordEvent(_clientId: string, eventType: string) {
    this.events.push(eventType);
  }
}
