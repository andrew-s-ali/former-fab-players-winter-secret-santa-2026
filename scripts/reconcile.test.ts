import { describe, expect, it } from "vitest";
import {
  describeReconciliation,
  isClean,
  reconcileSignups,
} from "./reconcile";
import type { FormSubmission } from "./netlify-forms";

const submission = (name: string, created_at = "2026-09-01T10:00:00Z"): FormSubmission => ({
  id: name,
  created_at,
  data: { name },
});

describe("reconcileSignups", () => {
  it("is clean when every verified submission has a row", () => {
    const report = reconcileSignups({
      verified: [submission("Ada"), submission("Bob")],
      spam: [],
      storedNames: ["Ada", "Bob"],
    });

    expect(isClean(report)).toBe(true);
    expect(describeReconciliation(report)).toEqual([]);
  });

  // The failure this exists for: Netlify accepted the submission, the
  // submitter saw success, and signup-submitted never wrote the row.
  it("names a verified submission that never reached the database", () => {
    const report = reconcileSignups({
      verified: [submission("Ada"), submission("Bob", "2026-09-02T09:00:00Z")],
      spam: [],
      storedNames: ["Ada"],
    });

    expect(report.unrecorded).toEqual([
      { name: "Bob", submittedAt: "2026-09-02T09:00:00Z" },
    ]);
    expect(describeReconciliation(report).join("\n")).toMatch(/missing: Bob/);
  });

  // An Akismet false positive is invisible everywhere else.
  it("reports what is sitting in the spam list", () => {
    const report = reconcileSignups({
      verified: [submission("Ada")],
      spam: [submission("Cleo", "2026-09-03T08:00:00Z")],
      storedNames: ["Ada"],
    });

    expect(report.heldAsSpam).toEqual([
      { name: "Cleo", submittedAt: "2026-09-03T08:00:00Z" },
    ]);
    expect(isClean(report)).toBe(false);
  });

  it("matches names case-insensitively and ignores surrounding space", () => {
    const report = reconcileSignups({
      verified: [submission("  ADA  ")],
      spam: [],
      storedNames: ["ada"],
    });

    expect(report.unrecorded).toEqual([]);
    expect(report.unmatched).toEqual([]);
  });

  // Resubmitting is how somebody fixes a typo, so two submissions under one
  // name are one person, not a discrepancy.
  it("treats a resubmission as the same person", () => {
    const report = reconcileSignups({
      verified: [submission("Ada", "2026-09-01T10:00:00Z"), submission("Ada", "2026-09-04T10:00:00Z")],
      spam: [],
      storedNames: ["Ada"],
    });

    expect(isClean(report)).toBe(true);
  });

  it("notes a row with no verified submission behind it", () => {
    const report = reconcileSignups({
      verified: [submission("Ada")],
      spam: [],
      storedNames: ["Ada", "Ghost"],
    });

    expect(report.unmatched).toEqual(["Ghost"]);
    expect(describeReconciliation(report).join("\n")).toMatch(/unmatched: Ghost/);
  });

  // normalizeSignup rejects these loudly at import; reporting them here too
  // would just be noise the organiser has to dismiss twice.
  it("leaves a nameless submission for the importer to reject", () => {
    const report = reconcileSignups({
      verified: [{ id: "1", created_at: "2026-09-01T10:00:00Z", data: { name: "  " } }],
      spam: [],
      storedNames: [],
    });

    expect(report.unrecorded).toEqual([]);
  });

  it("puts the blocking problem before the advisory ones", () => {
    const lines = describeReconciliation(
      reconcileSignups({
        verified: [submission("Bob")],
        spam: [submission("Cleo")],
        storedNames: ["Ghost"],
      })
    ).join("\n");

    expect(lines.indexOf("never reached the database")).toBeLessThan(
      lines.indexOf("spam list")
    );
    expect(lines.indexOf("spam list")).toBeLessThan(lines.indexOf("no verified submission"));
  });
});
