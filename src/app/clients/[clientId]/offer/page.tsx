import type { Metadata } from "next";
import { Suspense } from "react";
import { OfferRoute } from "@/components/offers/offer-route";
import { Skeleton } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Offer", robots: { index: false, follow: false } };

export default function OfferPage({ params, searchParams }: PageProps<"/clients/[clientId]/offer">) {
  return (
    <Suspense fallback={<Skeleton className="h-[640px]" />}>
      <OfferPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function OfferPageContent({ params, searchParams }: { params: PageProps<"/clients/[clientId]/offer">["params"]; searchParams: PageProps<"/clients/[clientId]/offer">["searchParams"] }) {
  const { clientId } = await params;
  const { project } = await searchParams;
  return <OfferRoute clientId={decodeURIComponent(clientId)} projectId={typeof project === "string" ? project : null} />;
}
