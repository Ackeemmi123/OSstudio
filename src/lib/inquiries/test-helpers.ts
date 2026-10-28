/** The handoff contract's example inquiry, for tests. Every value is invented test data. */
export const INQUIRY_TEST_NOW = new Date("2026-10-28T09:30:12.000Z");

export function examplePayload(overrides: Record<string, unknown> = {}, now: Date = INQUIRY_TEST_NOW): Record<string, unknown> {
  return {
    version: 1,
    source: "axivo_website",
    submissionId: "6f1d2c1e-4b7a-4e0c-9a51-2f8d3c7b9e10",
    submittedAt: now.toISOString(),
    test: true,
    locale: "sv",
    contact: { name: "Maja Lind", email: "maja@example.com", company: "Lumen Yoga (test)", website: "lumenyoga.example" },
    service: "websites",
    projectType: "website",
    budget: "custom",
    budgetAmount: 4500,
    timeline: "within_3_months",
    // 79 days ahead: 2027-01-15 for INQUIRY_TEST_NOW, as in the handoff example.
    desiredDate: new Date(now.getTime() + 79 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    message: "Vi vill ha en ny webbplats med bokning av klasser.",
    privacyNoticeVersion: "unpublished",
    meta: { ip: "203.0.113.7" },
    ...overrides,
  };
}
