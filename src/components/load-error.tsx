import { TriangleAlert } from "lucide-react";
import { EmptyState, Surface } from "@/components/ui/surface";

export function LoadError({ message }: { message: string }) {
  return (
    <Surface>
      <EmptyState
        icon={<TriangleAlert />}
        title="The workspace could not be loaded"
        description={`${message} Reload the page to try again.`}
      />
    </Surface>
  );
}
