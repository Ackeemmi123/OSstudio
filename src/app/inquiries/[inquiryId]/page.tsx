import type { Metadata } from "next";
import { Suspense } from "react";
import { InquiryReview, InquirySkeleton } from "@/components/inquiries/inquiry-review";

export const metadata: Metadata = { title: "Website inquiry" };

export default function InquiryPage({ params }: PageProps<"/inquiries/[inquiryId]">) {
  return (
    <Suspense fallback={<InquirySkeleton />}>
      <InquiryRoute params={params} />
    </Suspense>
  );
}

async function InquiryRoute({ params }: { params: PageProps<"/inquiries/[inquiryId]">["params"] }) {
  const { inquiryId } = await params;
  return <InquiryReview inquiryId={decodeURIComponent(inquiryId)} />;
}
