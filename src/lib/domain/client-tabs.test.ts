import { describe, expect, it } from "vitest";
import { hashTarget, tabForHash } from "./client-tabs";

describe("client page tabs", () => {
  it("opens the tab a link points into", () => {
    expect(tabForHash("#task-1")).toBe("projects");
    expect(tabForHash("#project-1")).toBe("projects");
    expect(tabForHash("#new-project")).toBe("projects");
    expect(tabForHash("#brief-goal")).toBe("brief");
    expect(tabForHash("#analysis")).toBe("sources");
    expect(tabForHash("#retention")).toBe("activity");
  });

  it("falls back to the overview", () => {
    expect(tabForHash("")).toBe("overview");
    expect(tabForHash("#overview")).toBe("overview");
    expect(tabForHash("#something-else")).toBe("overview");
  });

  it("scrolls only to things inside a tab", () => {
    expect(hashTarget("#task-1")).toBe("task-1");
    expect(hashTarget("#analysis")).toBe("analysis");
    expect(hashTarget("#brief")).toBeNull();
    expect(hashTarget("#new-project")).toBeNull();
    expect(hashTarget("")).toBeNull();
  });
});
