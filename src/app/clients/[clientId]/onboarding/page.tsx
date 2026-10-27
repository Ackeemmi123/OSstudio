import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingRoute, OnboardingSkeleton } from "@/components/onboarding/onboarding-flow";

export const metadata: Metadata = { title: "Onboarding" };

export default function OnboardingPage({ params }: PageProps<"/clients/[clientId]/onboarding">) {
  return (
    <Suspense fallback={<OnboardingSkeleton />}>
      <OnboardingPageContent params={params} />
    </Suspense>
  );
}

async function OnboardingPageContent({ params }: { params: PageProps<"/clients/[clientId]/onboarding">["params"] }) {
  const { clientId } = await params;
  return <OnboardingRoute clientId={decodeURIComponent(clientId)} />;
}
