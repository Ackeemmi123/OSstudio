import { createClient } from "@supabase/supabase-js";
import { calendar, nextStepEvent, type CalendarEvent } from "@/lib/domain/next-steps";
import { serverSupabase } from "@/server/config";

interface FeedItems {
  studio: string;
  steps: { id: string; title: string; client: string; clientId: string; dueOn: string; dueTime: string | null; assignee: string | null; updatedAt: string }[];
  tasks: { id: string; title: string; project: string; client: string; clientId: string; dueOn: string; updatedAt: string }[];
}

const TOKEN = /^[0-9a-f]{64}$/;

/**
 * A member's private calendar feed: the studio's open next steps and dated
 * tasks, for a calendar app to subscribe to. No sign-in: the long random link
 * is the key, and it stops working when it is turned off or the person leaves
 * the studio. Only titles, client names and times leave Studio OS.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, "");
  const notFound = () => new Response("This calendar link does not exist or was turned off.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" } });
  if (!TOKEN.test(token)) return notFound();
  const supabase = serverSupabase();
  if (!supabase.ok) return new Response("Not available.", { status: 503 });
  const db = createClient(supabase.url, supabase.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("calendar_feed_items", { p_token: token });
  if (error) return new Response("The calendar could not be read. Try again later.", { status: 500 });
  const items = data as FeedItems | null;
  if (!items) return notFound();

  const origin = new URL(request.url).origin;
  const events: CalendarEvent[] = [
    ...items.steps.map((step) => ({
      ...nextStepEvent({ id: step.id, title: step.title, dueOn: step.dueOn, dueTime: step.dueTime ? step.dueTime.slice(0, 5) : null, createdAt: step.updatedAt, clientId: step.clientId }, step.client, origin),
      ...(step.assignee ? { description: `Next step in Studio OS, for ${step.assignee}` } : {}),
    })),
    ...items.tasks.map((task) => ({
      uid: `task-${task.id}@studio-os`,
      title: `Task: ${task.title} · ${task.client}`,
      description: `Task in Studio OS, project ${task.project}`,
      url: `${origin}/clients/${encodeURIComponent(task.clientId)}`,
      dueOn: task.dueOn,
      dueTime: null,
      stamp: task.updatedAt,
    })),
  ];
  return new Response(calendar(`Studio OS · ${items.studio}`, events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="studio-os.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
