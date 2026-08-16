import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BANNED_COMMANDERS } from "@/lib/rules";
import { RulesSummary } from "./RulesSummary";

describe("RulesSummary", () => {
  it("states the budget", () => {
    render(<RulesSummary />);

    expect(screen.getByText(/\$75/)).toBeInTheDocument();
  });

  it("states the uncommon commander rule", () => {
    render(<RulesSummary />);

    // "uncommon" is wrapped in <strong>, so the phrase is split across
    // elements — match on an element's full text content (matcher recipe
    // from Testing Library's "text broken up by multiple elements" docs)
    // instead of relying on a single text node.
    const pattern = /legendary creatures.*uncommon/i;
    expect(
      screen.getByText((_content, element) => {
        if (!element) {
          return false;
        }
        const hasFullText = (node: Element) =>
          pattern.test(node.textContent ?? "");
        return (
          hasFullText(element) &&
          Array.from(element.children).every((child) => !hasFullText(child))
        );
      })
    ).toBeInTheDocument();
  });

  it("lists every banned commander", () => {
    render(<RulesSummary />);

    for (const name of BANNED_COMMANDERS) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("presents Malcolm + Kediss as a pair ban, not two card bans", () => {
    render(<RulesSummary />);

    expect(
      screen.getByText(/Malcolm.*Kediss.*banned as a pair/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/^Malcolm, Keen-Eyed Navigator$/)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/^Kediss, Emberclaw Familiar$/)
    ).not.toBeInTheDocument();
  });
});
