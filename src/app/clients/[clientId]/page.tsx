import { Suspense } from "react";
import { ClientWorkspace, WorkspaceSkeleton } from "@/components/clients/client-workspace";

export default function ClientPage({ params }: PageProps<"/clients/[clientId]">) {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <ClientWorkspaceRoute params={params} />
    </Suspense>
  );
}

async function ClientWorkspaceRoute({ params }: { params: PageProps<"/clients/[clientId]">["params"] }) {
  const { clientId } = await params;
  return <ClientWorkspace clientId={decodeURIComponent(clientId)} />;
}
