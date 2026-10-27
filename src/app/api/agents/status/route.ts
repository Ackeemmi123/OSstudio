import { connection } from "next/server";
import { intakeModel } from "@/server/config";

/** Whether the intake agent can run on this server. Reports configuration only, never credentials. */
export async function GET() {
  await connection();
  const config = intakeModel();
  return Response.json(
    {
      intake: config.ok
        ? { available: true, provider: config.model.runner, model: config.model.model, test: config.model.test, reason: null }
        : { available: false, provider: null, model: null, test: false, reason: config.reason },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
