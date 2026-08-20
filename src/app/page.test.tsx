import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalNow = process.env.SIGNUPS_NOW;

beforeEach(() => {
  process.env.SIGNUPS_NOW = "2026-08-19T00:00:00.000Z";
});

afterEach(() => {
  if (originalNow === undefined) {
    delete process.env.SIGNUPS_NOW;
  } else {
    process.env.SIGNUPS_NOW = originalNow;
  }
  vi.doUnmock("@/lib/event");
  vi.resetModules();
});

/** Loads the route fresh, with `SIGNUPS_OPEN_AT` set to `opensAt`. */
async function homeWithOpenDate(opensAt: string | null) {
  vi.resetModules();
  vi.doMock("@/lib/event", async () => ({
    ...(await vi.importActual<typeof import("@/lib/event")>("@/lib/event")),
    SIGNUPS_OPEN_AT: opensAt,
  }));

  return (await import("./page")).default;
}

describe("Home", () => {
  it("shows the splash page while registration has not opened", async () => {
    const Home = await homeWithOpenDate("2026-09-01");
    render(<Home />);

    expect(screen.getByText(/13 days/i)).toBeInTheDocument();
    expect(screen.getByText(/until sign-ups open/i)).toBeInTheDocument();
    // The point of the splash: nothing is on offer yet.
    expect(screen.queryByRole("link", { name: /sign up/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^rules$/i })).not.toBeInTheDocument();
  });

  it("shows the splash page when no opening date has been announced", async () => {
    const Home = await homeWithOpenDate(null);
    render(<Home />);

    expect(screen.getByText(/sign-ups open soon/i)).toBeInTheDocument();
  });

  it("shows the real home page once registration has opened", async () => {
    const Home = await homeWithOpenDate("2026-08-01");
    render(<Home />);

    expect(screen.getByRole("heading", { name: /^rules$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign up/i })).toHaveAttribute(
      "href",
      "/signup"
    );
  });
});
