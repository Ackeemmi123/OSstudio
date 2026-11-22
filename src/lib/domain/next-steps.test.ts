import { describe, expect, it } from "vitest";
import { calendar, describeDue, groupNextSteps, helsinkiToUtc, nextStepEvent } from "./next-steps";
import type { NextStep } from "./types";

const step = (over: Partial<NextStep>): NextStep => ({
  id: "s1",
  clientId: "c1",
  title: "Call back (test)",
  note: "",
  dueOn: "2026-11-24",
  dueTime: null,
  assignee: null,
  status: "open",
  doneAt: null,
  createdBy: { kind: "human", name: "Alex" },
  createdAt: "2026-11-22T10:00:00Z",
  ...over,
});

// Monday 23 November 2026, 12:00 in Helsinki.
const NOW = Date.parse("2026-11-23T10:00:00Z");

describe("next steps", () => {
  it("are grouped by the Helsinki day, open ones only, earliest first", () => {
    const groups = groupNextSteps(
      [
        step({ id: "late", dueOn: "2026-11-20" }),
        step({ id: "noon", dueOn: "2026-11-23", dueTime: "12:00" }),
        step({ id: "morning", dueOn: "2026-11-23", dueTime: "09:00" }),
        step({ id: "next", dueOn: "2026-11-30" }),
        step({ id: "done", dueOn: "2026-11-23", status: "done" }),
      ],
      NOW,
    );
    expect(groups.overdue.map((s) => s.id)).toEqual(["late"]);
    expect(groups.today.map((s) => s.id)).toEqual(["morning", "noon"]);
    expect(groups.upcoming.map((s) => s.id)).toEqual(["next"]);
  });

  it("say when they are due in plain words", () => {
    expect(describeDue({ dueOn: "2026-11-23", dueTime: "10:00" }, NOW)).toBe("Today, 10:00");
    expect(describeDue({ dueOn: "2026-11-24", dueTime: null }, NOW)).toBe("Tomorrow");
    expect(describeDue({ dueOn: "2026-11-27", dueTime: "14:30" }, NOW)).toBe("Fri 27 Nov, 14:30");
  });

  it("turn Helsinki wall-clock time into UTC, in winter and in summer", () => {
    expect(helsinkiToUtc("2026-11-24", "10:00").toISOString()).toBe("2026-11-24T08:00:00.000Z");
    expect(helsinkiToUtc("2026-06-24", "10:00").toISOString()).toBe("2026-06-24T07:00:00.000Z");
  });
});

describe("the calendar", () => {
  it("writes a valid feed with timed and all-day events, each with a reminder", () => {
    const text = calendar("Studio OS · Axivo", [
      nextStepEvent(step({ id: "a", dueTime: "10:00" }), "Kafé Testgränd (TEST)", "https://studio.example"),
      nextStepEvent(step({ id: "b" }), "Testlunds; Snickeri, (TEST)", "https://studio.example"),
    ]);
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text).toContain("UID:next-step-a@studio-os");
    expect(text).toContain("DTSTART:20261124T080000Z");
    expect(text).toContain("DURATION:PT30M");
    expect(text).toContain("TRIGGER:-PT15M");
    expect(text).toContain("DTSTART;VALUE=DATE:20261124");
    expect(text).toContain("DTEND;VALUE=DATE:20261125");
    expect(text).toContain("TRIGGER:PT9H");
    expect(text).toContain("Testlunds\\; Snickeri\\, (TEST)");
    expect(text).toContain("URL:https://studio.example/clients/c1");
    expect(text.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });

  it("folds long lines without splitting a letter", () => {
    const long = calendar("Kalender", [nextStepEvent(step({ title: "Ring tillbaka och gå igenom öppettiderna, menyn och kalasbeställningarna för hösten" }), "Kafé Testgränd (TEST)", "https://studio.example")]);
    const unfolded = long.replace(/\r\n /g, "");
    expect(unfolded).toContain("SUMMARY:Ring tillbaka och gå igenom öppettiderna\\, menyn och kalasbeställningarna för hösten · Kafé Testgränd (TEST)");
  });
});
