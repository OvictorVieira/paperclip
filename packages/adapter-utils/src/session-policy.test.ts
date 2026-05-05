import { describe, expect, it } from "vitest";
import {
  getSessionPolicy,
  shouldInjectSummary,
  shouldPersistSession,
  shouldResumeSession,
} from "./session-policy.js";

describe("session policy helpers", () => {
  it("defaults to resume for compatibility", () => {
    expect(getSessionPolicy(undefined)).toBe("resume");
    expect(shouldResumeSession({})).toBe(true);
    expect(shouldPersistSession({ sessionPolicy: "unknown" })).toBe(true);
  });

  it("supports fresh and summarized non-resumable modes", () => {
    expect(shouldResumeSession({ sessionPolicy: "fresh" })).toBe(false);
    expect(shouldPersistSession({ sessionPolicy: "fresh" })).toBe(false);
    expect(shouldInjectSummary({ sessionPolicy: "fresh" })).toBe(false);
    expect(shouldResumeSession({ sessionPolicy: "summarized" })).toBe(false);
    expect(shouldPersistSession({ sessionPolicy: "summarized" })).toBe(false);
    expect(shouldInjectSummary({ sessionPolicy: "summarized" })).toBe(true);
    expect(shouldInjectSummary({ sessionPolicy: "resume" })).toBe(false);
    expect(shouldInjectSummary({})).toBe(false);
  });
});
