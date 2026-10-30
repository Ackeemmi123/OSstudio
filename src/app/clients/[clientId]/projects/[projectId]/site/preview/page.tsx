import type { Metadata } from "next";
import { Suspense } from "react";
import { SitePreviewRoute } from "@/components/site-spec/site-preview";
import { SiteSpecSkeleton } from "@/components/site-spec/site-spec-route";

export const metadata: Metadata = { title: "Website preview", robots: { index: false, follow: false } };

export default function SitePreviewPage({ params }: PageProps<"/clients/[clientId]/projects/[projectId]/site/preview">) {
  return (
    <Suspense fallback={<SiteSpecSkeleton />}>
      <SitePreviewPageContent params={params} />
    </Suspense>
  );
}

async function SitePreviewPageContent({ params }: { params: PageProps<"/clients/[clientId]/projects/[projectId]/site/preview">["params"] }) {
  const { clientId, projectId } = await params;
  return <SitePreviewRoute clientId={decodeURIComponent(clientId)} projectId={decodeURIComponent(projectId)} />;
}
