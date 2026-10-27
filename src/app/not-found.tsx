import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Surface } from "@/components/ui/surface";

export default function NotFound() {
  return (
    <Surface>
      <EmptyState
        title="Page not found"
        description="This page doesn't exist in Studio OS."
        action={<ButtonLink href="/">Go to Overview</ButtonLink>}
      />
    </Surface>
  );
}
