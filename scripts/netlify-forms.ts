import { SIGNUP_FORM_NAME, type SignupEntry, normalizeSignup } from "#lib/signup";

const API = "https://api.netlify.com/api/v1";

/** A form submission as the API returns it; only the fields we rely on. */
export type FormSubmission = {
  id: string;
  created_at: string;
  data: Record<string, string>;
};

type Form = { id: string; name: string };

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

async function getJson<T>(url: string, token: string): Promise<Response & { parsed: T }> {
  const response = await fetch(url, { headers: authHeaders(token) });

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Netlify API rejected the token (${response.status}). NETLIFY_AUTH_TOKEN ` +
        "must be a personal access token for an account with access to this site."
    );
  }
  if (!response.ok) {
    throw new Error(`Netlify API request failed: ${response.status} ${response.statusText} (${url})`);
  }

  const parsed = (await response.json()) as T;
  return Object.assign(response, { parsed });
}

/**
 * Extracts the `rel="next"` URL from a Link header.
 *
 * The API pages submissions, and a caller that reads only the first response
 * gets a silently short list. Here that would mean drawing without some of the
 * participants — which produces a valid-looking ring that is missing people —
 * so paging is not optional.
 */
export function nextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }

  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel\s*=\s*"?next"?/i);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/** Resolves the sign-up form's id, failing with the names that do exist. */
async function findFormId(siteId: string, token: string): Promise<string> {
  const { parsed: forms } = await getJson<Form[]>(`${API}/sites/${siteId}/forms`, token);
  const form = forms.find((f) => f.name === SIGNUP_FORM_NAME);

  if (!form) {
    throw new Error(
      `Site ${siteId} has no form named "${SIGNUP_FORM_NAME}". ` +
        (forms.length > 0
          ? `Forms found: ${forms.map((f) => f.name).join(", ")}.`
          : "No forms are registered at all — check that form detection is " +
            "enabled in the Netlify UI (Forms > Enable form detection) and " +
            "that the site has been deployed since public/__forms.html was added.")
    );
  }
  return form.id;
}

/**
 * Fetches every submission for the sign-up form.
 *
 * `state` is the API's own filter: omit it for verified submissions, or pass
 * "spam" to review what Akismet held back.
 */
export async function fetchSubmissions(
  siteId: string,
  token: string,
  { state }: { state?: "spam" } = {}
): Promise<FormSubmission[]> {
  const formId = await findFormId(siteId, token);
  const submissions: FormSubmission[] = [];

  let url: string | null =
    `${API}/forms/${formId}/submissions?per_page=100` + (state ? `&state=${state}` : "");

  while (url) {
    const response = await getJson<FormSubmission[]>(url, token);
    submissions.push(...response.parsed);
    url = nextPageUrl(response.headers.get("link"));
  }

  return submissions;
}

/** Normalises submissions into draw inputs, oldest first. */
export function toSignupEntries(submissions: FormSubmission[]): SignupEntry[] {
  return submissions
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((submission) => ({
      input: normalizeSignup(
        submission.data ?? {},
        `The submission from ${submission.created_at}`
      ),
      submittedAt: submission.created_at,
    }));
}
