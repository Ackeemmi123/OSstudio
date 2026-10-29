import { connection } from "next/server";
import { aiMonthlyBudget, agentModel } from "@/server/config";

/** Whether the intake agent can run on this server. Reports configuration only, never credentials or spend. */
export async function GET() {
  await connection();
  const config = agentModel();
  const budget = aiMonthlyBudget();
  const unavailable = !config.ok ? config.reason : !budget.ok ? budget.reason : null;
  return Response.json(
    {
      intake:
        config.ok && budget.ok
          ? { available: true, provider: config.model.runner, model: config.model.model, test: config.model.test, reason: null }
          : { available: false, provider: null, model: null, test: false, reason: unavailable },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
