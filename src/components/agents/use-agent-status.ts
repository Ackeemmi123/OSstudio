"use client";

import { useEffect, useState } from "react";

/** What the server reports about the intake agent. Never includes credentials. */
export type AgentStatus =
  | { state: "loading" }
  | { state: "available"; provider: string; model: string | null; test: boolean }
  | { state: "unavailable"; reason: string };

let cached: Promise<AgentStatus> | null = null;

function fetchStatus(): Promise<AgentStatus> {
  cached ??= fetch("/api/agents/status")
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .then((body: { intake: { available: boolean; provider: string | null; model: string | null; test: boolean; reason: string | null } }) =>
      body.intake.available
        ? { state: "available" as const, provider: body.intake.provider ?? "unknown", model: body.intake.model, test: body.intake.test }
        : { state: "unavailable" as const, reason: body.intake.reason ?? "No model provider is configured on the server." },
    )
    .catch(() => {
      cached = null;
      return { state: "unavailable" as const, reason: "The server did not report whether an AI model is configured." };
    });
  return cached;
}

export function useAgentStatus(enabled = true): AgentStatus {
  const [status, setStatus] = useState<AgentStatus>({ state: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void fetchStatus().then((next) => {
      if (active) setStatus(next);
    });
    return () => {
      active = false;
    };
  }, [enabled]);
  return enabled ? status : { state: "unavailable", reason: "Agents run on the server and need a signed-in workspace. The local demo cannot run them." };
}
