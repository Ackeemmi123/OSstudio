import { Suspense } from "react";
import { ClientProfile, ProfileSkeleton } from "@/components/clients/client-profile";

export default function ClientPage({ params }: PageProps<"/clients/[clientId]">) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ClientProfileRoute params={params} />
    </Suspense>
  );
}

async function ClientProfileRoute({ params }: { params: PageProps<"/clients/[clientId]">["params"] }) {
  const { clientId } = await params;
  return <ClientProfile clientId={decodeURIComponent(clientId)} />;
}
