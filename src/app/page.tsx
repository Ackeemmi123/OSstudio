import type { Metadata } from "next";
import { TodayView } from "@/components/today/today-view";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return <TodayView />;
}
