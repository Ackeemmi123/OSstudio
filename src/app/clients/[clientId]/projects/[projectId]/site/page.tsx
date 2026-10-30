import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteSpecRoute, SiteSpecSkeleton } from "@/components/site-spec/site-spec-route";

export const metadata: Metadata = { title: "Website spec" };

export default function SiteSpecPage({ params }: PageProps<"/clients/[clientId]/projects/[projectId]/site">) {
  return (
    <Suspense fallback={<SiteSpecSkeleton />}>
      <SiteSpecPageContent params={params} />
    </Suspense>
  );
}

async function SiteSpecPageContent({ params }: { params: PageProps<"/clients/[clientId]/projects/[projectId]/site">["params"] }) {
  const { clientId, projectId } = await params;
  return <SiteSpecRoute clientId={decodeURIComponent(clientId)} projectId={decodeURIComponent(projectId)} />;
}
