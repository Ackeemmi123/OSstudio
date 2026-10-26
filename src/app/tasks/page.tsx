import type { Metadata } from "next";
import { TasksView } from "@/components/workspace/tasks-view";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return <TasksView />;
}
