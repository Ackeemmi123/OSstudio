import type { Metadata } from "next";
import { TasksView } from "@/components/workspace/tasks-view";

export const metadata: Metadata = { title: "Approvals" };

export default function ApprovalsPage() {
  return (
    <TasksView
      title="Approvals"
      description="Work waiting for a client decision or an internal review."
      statuses={["awaiting_approval", "in_review"]}
      note="Approving work or requesting changes from Studio OS is not available yet. Decisions are currently handled outside the app."
      emptyTitle="Nothing is waiting for approval"
      allowShowDone={false}
    />
  );
}
