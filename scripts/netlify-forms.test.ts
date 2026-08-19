import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSubmissions, nextPageUrl, toSignupEntries } from "./netlify-forms";

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("nextPageUrl", () => {
  it("returns null when there is no header", () => {
    expect(nextPageUrl(null)).toBeNull();
  });

  it("picks the next link out of a multi-rel header", () => {
    const header =
      '<https://api.netlify.com/api/v1/forms/1/submissions?page=1>; rel="first", ' +
      '<https://api.netlify.com/api/v1/forms/1/submissions?page=3>; rel="next", ' +
      '<https://api.netlify.com/api/v1/forms/1/submissions?page=9>; rel="last"';

    expect(nextPageUrl(header)).toBe(
      "https://api.netlify.com/api/v1/forms/1/submissions?page=3"
    );
  });

  it("returns null on the last page, where only prev and first are offered", () => {
    const header =
      '<https://api.netlify.com/api/v1/forms/1/submissions?page=1>; rel="first", ' +
      '<https://api.netlify.com/api/v1/forms/1/submissions?page=8>; rel="prev"';

    expect(nextPageUrl(header)).toBeNull();
  });
});

describe("toSignupEntries", () => {
  it("normalises and sorts oldest first", () => {
    const entries = toSignupEntries([
      { id: "2", created_at: "2026-09-02T10:00:00Z", data: { name: "Bob" } },
      { id: "1", created_at: "2026-09-01T10:00:00Z", data: { name: "Ada", colorVeto: "Red" } },
    ]);

    expect(entries.map((e) => e.input.name)).toEqual(["Ada", "Bob"]);
    expect(entries[0].input.colorVeto).toBe("R");
  });

  it("labels a bad submission with its timestamp so it can be found in the UI", () => {
    expect(() =>
      toSignupEntries([{ id: "1", created_at: "2026-09-01T10:00:00Z", data: { name: "" } }])
    ).toThrow(/2026-09-01T10:00:00Z/);
  });
});

describe("fetchSubmissions", () => {
  it("follows every page rather than stopping at the first", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ id: "f1", name: "santa-signup" }]))
      .mockResolvedValueOnce(
        jsonResponse([{ id: "1", created_at: "2026-09-01T00:00:00Z", data: { name: "Ada" } }], {
          link: '<https://api.netlify.com/api/v1/forms/f1/submissions?page=2>; rel="next"',
        })
      )
      .mockResolvedValueOnce(
        jsonResponse([{ id: "2", created_at: "2026-09-02T00:00:00Z", data: { name: "Bob" } }])
      );
    vi.stubGlobal("fetch", fetchMock);

    const submissions = await fetchSubmissions("site", "token");

    expect(submissions.map((s) => s.data.name)).toEqual(["Ada", "Bob"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("asks for the spam list when told to", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ id: "f1", name: "santa-signup" }]))
      .mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSubmissions("site", "token", { state: "spam" });

    expect(fetchMock.mock.calls[1][0]).toContain("state=spam");
  });

  it("explains what to check when the form is not registered at all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));

    await expect(fetchSubmissions("site", "token")).rejects.toThrow(
      /form detection/i
    );
  });

  it("names the other forms when the sign-up form is missing but others exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse([{ id: "x", name: "contact" }]))
    );

    await expect(fetchSubmissions("site", "token")).rejects.toThrow(/contact/);
  });

  it("calls out a rejected token rather than reporting a generic failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 401 }))
    );

    await expect(fetchSubmissions("site", "token")).rejects.toThrow(
      /NETLIFY_AUTH_TOKEN/
    );
  });
});
