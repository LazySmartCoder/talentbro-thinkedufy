import { setCollegeName } from "@/lib/branding";
import { setUserRole } from "@/lib/user-role";
import type { GdRollupRow, HistoryPage, PracticeRollupRow } from "@/lib/paged-history";

/**
 * Build the `?limit=&offset=` suffix for a paged history request, including the
 * leading `?` and including nothing at all when neither is given, so a call
 * without arguments still hits the endpoint's own default page.
 */
function historyQuery({ limit, offset }: { limit?: number; offset?: number }): string {
  const search = new URLSearchParams();
  if (typeof limit === "number") search.set("limit", String(limit));
  if (typeof offset === "number") search.set("offset", String(offset));
  const query = search.toString();
  return query ? `?${query}` : "";
}

export type { HistoryPage, PracticeRollupRow };

const API_BASE = ((import.meta.env["VITE_API_URL"] as string | undefined) ?? "").replace(
  /\/+$/,
  "",
);

// Absolute URL for a backend path, for the cases the browser has to follow
// itself rather than go through `apiFetch` — an <a download> pointing at a
// generated file, for instance. The session cookie rides along on a normal
// navigation, so an authenticated endpoint works as a plain link.
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

// Every account has exactly one Role: Student (candidate) or Institution Staff.
// Note: candidates and students are the same in this project.
export type UserType = "student" | "institution_staff";

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  avatar?: string;
  /**
   * What this account is called at work, e.g. "Placement Coordinator". Only
   * institution staff record one; empty for students.
   */
  designation?: string;
  institution: string | null;
  institution_logo?: string;
  role: UserType;
  profile_complete?: boolean;
  missing_fields?: string[];
  profile?: unknown;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1] ?? "") : null;
}

// The CSRF token, cached for the life of the page.
//
// It is deliberately NOT read from document.cookie on every call. The SPA
// (ins.talentbro.in) and the API (ins-api.talentbro.in) are different
// subdomains, so a host-only csrftoken cookie is sent back to the API but is
// invisible to this page's JS — readCookie then returns null, the X-CSRFToken
// header is silently omitted, and every POST comes back "403 Forbidden (CSRF
// token missing.)". /api/auth/csrf/ returns the token in the response body, so
// this works whatever the cookie's Domain/Secure/SameSite settings are.
let cachedCsrfToken: string | null = null;

async function fetchCsrfToken(): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/auth/csrf/`, {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Is the backend running?");
  }
  const data = (await res.json().catch(() => ({}))) as { csrfToken?: string };
  // Fall back to the cookie for a server that predates the csrfToken field.
  cachedCsrfToken = data.csrfToken ?? readCookie("csrftoken");
  if (!cachedCsrfToken) {
    throw new ApiError(0, "Could not obtain a CSRF token from the server.");
  }
  return cachedCsrfToken;
}

// A stalled request used to leave the white "Loading…" screen up forever. Every
// fetch now aborts after a while and surfaces a retryable error instead.
const DEFAULT_TIMEOUT_MS = 20_000;
// LLM-backed endpoints can legitimately take well over the default timeout.
const LONG_TIMEOUT_MS = 90_000;

export type ApiFetchOptions = RequestInit & { timeoutMs?: number };

/** A finished request: the raw response plus its already-parsed JSON body. */
type ApiResult = { res: Response; payload: Record<string, unknown> };

/**
 * One request, token acquisition included. Deliberately does NOT raise on a
 * non-2xx status: the caller needs the status and body to tell an ordinary
 * failure (a 400, a 401) apart from a CSRF rejection it can recover from.
 */
async function sendOnce(path: string, init?: ApiFetchOptions): Promise<ApiResult> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body) {
    headers.set("Content-Type", "application/json");
  }

  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    // Self-heal: without this a missing token used to be sent as no header at
    // all, which surfaced as an unexplained 403 rather than a fixable error.
    const csrfToken = cachedCsrfToken ?? readCookie("csrftoken") ?? (await fetchCsrfToken());
    headers.set("X-CSRFToken", csrfToken);
  }

  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { timeoutMs: _omitted, ...requestInit } = init ?? {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = requestInit.signal
    ? AbortSignal.any([requestInit.signal, controller.signal])
    : controller.signal;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...requestInit,
      headers,
      credentials: "include",
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError" && !requestInit.signal?.aborted) {
      throw new ApiError(0, "The server took too long to respond. Please try again.");
    }
    throw new ApiError(0, "Could not reach the server. Is the backend running?");
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let payload: Record<string, unknown> = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // non-JSON response body
    }
  }

  return { res, payload };
}

/**
 * Did this come back as a CSRF rejection rather than a real error?
 *
 * Django's CsrfViewMiddleware answers a bad X-CSRFToken with a 403 whose
 * `detail` names the reason, e.g. "CSRF token from the 'X-Csrftoken' HTTP
 * header incorrect." — note "incorrect", not "missing": the header was sent,
 * it just no longer matched the cookie. Matching on the wording is what
 * separates a retryable token problem from a genuine 403 (a permission denial),
 * which must still surface to the caller.
 */
function isCsrfRejection(res: Response, payload: Record<string, unknown>): boolean {
  if (res.status !== 403) return false;
  const detail = typeof payload["detail"] === "string" ? payload["detail"] : "";
  return /csrf/i.test(detail);
}

async function apiFetch<T>(path: string, init?: ApiFetchOptions): Promise<T> {
  let { res, payload } = await sendOnce(path, init);

  if (isCsrfRejection(res, payload)) {
    // The cached token is stale. Django rotates the CSRF secret inside
    // django.contrib.auth.login() and logout() (views.py login_view/logout_view
    // both go through them), so signing in replaces the csrftoken cookie
    // server-side while this module still holds the pre-login token. Every
    // later write then sends a token the cookie no longer matches — which is
    // what made PATCH /api/auth/profile/ fail right after a successful login.
    //
    // Dropping the cache and refetching repairs that, and repairs every other
    // source of drift too (a session expiring and re-authenticating, another
    // tab signing in or out), so no individual caller has to remember to
    // refresh. Replaying is safe: the check runs in middleware, before the view,
    // so the rejected attempt changed nothing on the server. Bounded to one
    // retry so a genuinely unauthorised 403 still reaches the caller as an error.
    cachedCsrfToken = null;
    await fetchCsrfToken();
    ({ res, payload } = await sendOnce(path, init));
  }

  if (!res.ok) {
    const detail =
      typeof payload["detail"] === "string" ? payload["detail"] : `Request failed (${res.status}).`;
    throw new ApiError(res.status, detail);
  }

  return payload as T;
}

async function ensureCsrfCookie(): Promise<void> {
  await fetchCsrfToken();
}

export async function signup(body: {
  institutionName: string;
  fullName: string;
  email: string;
  password: string;
  userType: UserType;
}): Promise<AuthUser> {
  await ensureCsrfCookie();
  const data = await apiFetch<{ user: AuthUser }>("/api/auth/signup/", {
    method: "POST",
    body: JSON.stringify(body),
  });
  // Signup signs the new user in server-side, which rotates the CSRF secret.
  await ensureCsrfCookie();
  setCollegeName(data.user.institution);
  setUserRole(data.user.role);
  return data.user;
}

export async function login(body: {
  email: string;
  password: string;
  userType: UserType;
}): Promise<AuthUser> {
  await ensureCsrfCookie();
  const data = await apiFetch<{ user: AuthUser }>("/api/auth/login/", {
    method: "POST",
    body: JSON.stringify(body),
  });
  // Django's auth.login() rotates the CSRF secret, so the response just replaced
  // the csrftoken cookie. The cached token is now the pre-login one and every
  // later write would 403 with "CSRF token ... incorrect" until something
  // refetched it — re-sync here so the first write after signing in just works.
  await ensureCsrfCookie();
  setCollegeName(data.user.institution);
  setUserRole(data.user.role);
  return data.user;
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await ensureCsrfCookie();
  await apiFetch<{ ok: boolean }>("/api/auth/change-password/", {
    method: "POST",
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
}

export async function logout(): Promise<void> {
  await ensureCsrfCookie();
  await apiFetch<{ ok: boolean }>("/api/auth/logout/", { method: "POST" });
  // logout() rotates the CSRF secret too, discarding the token cached above.
  cachedCsrfToken = null;
  setCollegeName(null);
  setUserRole(null);
}

export async function deleteAccount(password?: string): Promise<void> {
  await ensureCsrfCookie();
  await apiFetch<{ ok: boolean }>("/api/auth/delete-account/", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  // The session is flushed server-side, so the cached token is dead with it.
  cachedCsrfToken = null;
  setCollegeName(null);
  setUserRole(null);
}

export async function me(): Promise<AuthUser | null> {
  try {
    const data = await apiFetch<{ user: AuthUser | null }>("/api/auth/me/");
    if (!data.user) {
      setCollegeName(null);
      setUserRole(null);
      return null;
    }
    setCollegeName(data.user.institution);
    setUserRole(data.user.role);
    return data.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      setCollegeName(null);
      setUserRole(null);
      return null;
    }
    throw error;
  }
}

// The signed-in student's own candidate profile id, or null for a non-candidate
// (institution staff) or an account whose profile row is still missing.
// Screens that are scoped to "my profile" resolve their ids from here so the
// URL never has to carry the viewer's own id around.
export function ownCandidateId(user: AuthUser | null | undefined): string | null {
  if (!user) return null;
  const profile = user.profile as { candidate_id?: string } | null | undefined;
  return profile?.candidate_id ?? null;
}

export type GdPanelist = { name: string; gender: "female" | "male" };

// The 6 AI members (3 Indian women + 3 Indian men) picked by Gemini 2.5 Flash
// Lite for a GD round; the student joins as the 7th member on the client.
export async function gdPanelists(): Promise<GdPanelist[]> {
  const data = await apiFetch<{ panelists: GdPanelist[] }>("/api/gd/panelists/");
  return data.panelists ?? [];
}

export type GdChatMessage = { name: string; content: string };

// Ask Gemini 2.5 Flash Lite for ONE next GD message. The entire transcript is
// sent each time so the reply continues the discussion as it stands; the
// student's name lets panelists acknowledge their points by name.
export async function gdChat(body: {
  topic: string;
  speaker: string;
  student?: string;
  transcript?: { name: string; content: string }[];
}): Promise<GdChatMessage> {
  const data = await apiFetch<{ message: GdChatMessage }>("/api/gd/chat/", {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: LONG_TIMEOUT_MS,
  });
  return data.message ?? { name: body.speaker, content: "" };
}

// A fresh GD topic for a new round. The backend skips topics the student has
// already discussed in saved rounds (cheap logical match, no model call) and
// only asks Gemini once the canned bank is exhausted.
export async function gdTopic(): Promise<string> {
  const data = await apiFetch<{ topic: string }>("/api/gd/topic/");
  return data.topic ?? "";
}

export type GdCompleteBody = {
  topic: string;
  participants: { name: string; gender: string; is_user: boolean }[];
  transcript: { name: string; content: string; from: string }[];
};

// Persist a finished GD round — even a near-empty one — so every topic a
// student trains on is recorded and repeats are avoided on the next round. The
// round is scored server-side from the transcript, and the saved round comes
// back so the client renders the real criteria instead of inventing its own.
export async function gdComplete(
  body: GdCompleteBody,
): Promise<{ id: string; session: GdTrainingRecord }> {
  const data = await apiFetch<{ id: string; session: GdTrainingRecord }>("/api/gd/complete/", {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: LONG_TIMEOUT_MS,
  });
  return data;
}

// Fire-and-forget GD save that keeps working when the tab closes (pagehide /
// beforeunload), so a round abandoned mid-way is still persisted.
export function gdCompleteKeepalive(body: GdCompleteBody): void {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  const csrfToken = cachedCsrfToken ?? readCookie("csrftoken");
  if (csrfToken) headers.set("X-CSRFToken", csrfToken);
  try {
    void fetch(`${API_BASE}/api/gd/complete/`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers,
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {
    // The tab is going away; this is a final best-effort flush.
  }
}

export type GdTrainingRecord = {
  id: string;
  title: string;
  topic: string;
  status: "active" | "completed";
  phase: string;
  duration_minutes: number;
  ended_at: string | null;
  grade: string;
  overall_score: number;
  criteria: { label: string; score: number }[];
  strengths: string[];
  improvement_areas: string[];
  created_at: string;
  updated_at: string;
  message_count: number;
  participants?: { name: string; gender: string; is_user: boolean }[];
  overall_summary?: string;
  transcript?: {
    role: "user" | "assistant";
    speaker: string;
    content: string;
    created_at?: string | null;
  }[];
};

// Every GD round a student completes is saved on the backend; list them
// newest first for the history page.
export async function gdList(
  params: {
    limit?: number;
    offset?: number;
  } = {},
): Promise<HistoryPage<GdTrainingRecord, GdRollupRow>> {
  const search = historyQuery(params);
  return apiFetch<HistoryPage<GdTrainingRecord, GdRollupRow>>(`/api/gd/history/${search}`);
}

// Full detail (roster, AI summary and transcript) for one saved GD round.
export async function gdDetail(id: string): Promise<GdTrainingRecord> {
  const data = await apiFetch<{ session: GdTrainingRecord }>(`/api/gd/${id}/`);
  return data.session;
}

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  translation?: string;
  id?: number;
};

export type ServerChatMessage = ChatMessage & {
  id: number;
  created_at: string;
};

export type ChatSessionSummary = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
};

export type ChatSession = ChatSessionSummary & {
  messages: ServerChatMessage[];
  older_available?: boolean;
};

export type ChatResponse = {
  reply: string;
  session_id: string;
  title: string;
  translation?: string;
  preferred_language?: string;
};

export async function chat(
  message: string,
  sessionId?: string | null,
  title?: string | null,
): Promise<ChatResponse> {
  const body: Record<string, string> = { message };
  if (sessionId) body["session_id"] = sessionId;
  if (title) body["title"] = title;
  return apiFetch<ChatResponse>("/api/chat/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify(body),
  });
}

export async function communicationTrainingChat(
  message: string,
  sessionId?: string | null,
): Promise<ChatResponse> {
  const body: Record<string, string> = { message };
  if (sessionId) body["session_id"] = sessionId;
  if (!sessionId) body["title"] = "Communication Training";
  return apiFetch<ChatResponse>("/api/chat/communication/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify(body),
  });
}

export type CommunicationTrainingTurns = {
  role: "user" | "assistant";
  content: string;
};

export type CommunicationTrainingTurnsResponse = {
  session_id: string;
  title: string;
};

export async function communicationTrainingAppendTurns(
  sessionId: string | null,
  turns: CommunicationTrainingTurns[],
): Promise<CommunicationTrainingTurnsResponse> {
  const body: Record<string, unknown> = { turns };
  if (sessionId) body["session_id"] = sessionId;
  else body["title"] = "Communication Training";
  return apiFetch<CommunicationTrainingTurnsResponse>("/api/chat/communication/turns/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify(body),
  });
}

export async function communicationTrainingFinalize(sessionId: string): Promise<{
  ok: boolean;
  session_id: string;
  analyzed: boolean;
}> {
  return apiFetch("/api/chat/communication/finalize/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({ session_id: sessionId }),
  });
}

// Fire-and-forget finalize that keeps working when the tab is closed, so a
// sudden browser close still tells the backend to lock the transcript and run
// the Gemini 2.5 Flash Lite analysis. Used from pagehide/beforeunload where a
// normal fetch may be cancelled.
export function finalizeCommunicationTrainingKeepalive(sessionId: string): void {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  const csrfToken = cachedCsrfToken ?? readCookie("csrftoken");
  if (csrfToken) headers.set("X-CSRFToken", csrfToken);
  try {
    void fetch(`${API_BASE}/api/chat/communication/finalize/`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers,
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => {});
  } catch {
    // The tab is going away; this is a final best-effort flush.
  }
}

export type CommunicationTrainingSession = {
  id: string;
  title: string;
  status: "active" | "completed";
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
  clarity: number;
  fluency: number;
  grammar: number;
  vocabulary: number;
  pronunciation: number;
  confidence: number;
  answer_structure: number;
  relevance: number;
  speaking_rate: number;
  pause_frequency: number;
  average_pause_duration: number;
  filler_words: number;
  repeated_words: number;
  sentence_restarts: number;
  intonation: number;
  speech_rhythm: number;
  voice_modulation: number;
  listening_skills: number;
  response_quality: number;
  professional_tone: number;
  conversational_skills: number;
  vocabulary_diversity: number;
  grammar_error_count: number;
  pronunciation_accuracy: number;
  communication_score: number;
  workplace_communication_readiness: number;
  interview_readiness: number;
  improvement_rate: number;
  recurring_mistakes: string;
  strengths: string;
  areas_for_improvement: string;
  ai_recommendations: string;
  practice_priorities: string;
  transcript?: { role: "user" | "assistant"; content: string; created_at: string }[];
};

export async function communicationTrainingList(
  params: {
    limit?: number;
    offset?: number;
  } = {},
): Promise<HistoryPage<CommunicationTrainingSession, PracticeRollupRow>> {
  const search = historyQuery(params);
  return apiFetch<HistoryPage<CommunicationTrainingSession, PracticeRollupRow>>(
    `/api/chat/communication/history/${search}`,
  );
}

export async function communicationTrainingDetail(
  sessionId: string,
): Promise<CommunicationTrainingSession> {
  const payload = await apiFetch<{ session: CommunicationTrainingSession }>(
    `/api/chat/communication/${sessionId}/`,
  );
  return payload.session;
}

export type EnglishTrainingMistake = {
  turn_index: number;
  category: string;
  original: string;
  corrected: string;
  explanation: string;
};

export type EnglishTrainingSession = {
  id: string;
  title: string;
  status: "active" | "completed";
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
  clarity: number;
  structure: number;
  grammar: number;
  vocabulary: number;
  spelling: number;
  conciseness: number;
  task_focus: number;
  professional_tone: number;
  writing_score: number;
  strengths: string;
  areas_for_improvement: string;
  ai_recommendations: string;
  recurring_mistakes: string;
  mistakes: EnglishTrainingMistake[];
  mistake_count: number;
  transcript?: { role: "user" | "assistant"; content: string; created_at: string }[];
};

export async function englishTrainingList(
  params: {
    limit?: number;
    offset?: number;
  } = {},
): Promise<HistoryPage<EnglishTrainingSession, PracticeRollupRow>> {
  const search = historyQuery(params);
  return apiFetch<HistoryPage<EnglishTrainingSession, PracticeRollupRow>>(
    `/api/speaking-skills/history/${search}`,
  );
}

export async function englishTrainingSessionDetail(
  sessionId: string,
): Promise<EnglishTrainingSession> {
  const payload = await apiFetch<{ session: EnglishTrainingSession }>(
    `/api/speaking-skills/${sessionId}/`,
  );
  return payload.session;
}

export type EnglishTrainingRecord = {
  practice_count: number;
  last_practiced_at: string | null;
  created_at: string;
  updated_at: string;
  clarity: number;
  structure: number;
  grammar: number;
  vocabulary: number;
  spelling: number;
  conciseness: number;
  task_focus: number;
  professional_tone: number;
  writing_score: number;
  strengths: string;
  areas_for_improvement: string;
  ai_recommendations: string;
  recurring_mistakes: string;
  transcript?: { role: "user" | "assistant"; content: string; created_at: string }[];
};

export async function englishTrainingDetail(): Promise<EnglishTrainingRecord> {
  const payload = await apiFetch<{ record: EnglishTrainingRecord }>("/api/speaking-skills/");
  return payload.record;
}

export type EnglishTrainingStartResponse = {
  reply: string;
  reused: boolean;
  session_id: string;
  record: EnglishTrainingRecord;
};

export async function englishTrainingStart(): Promise<EnglishTrainingStartResponse> {
  await ensureCsrfCookie();
  return apiFetch<EnglishTrainingStartResponse>("/api/speaking-skills/start/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({}),
  });
}

export async function englishTrainingChat(message: string): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/api/speaking-skills/chat/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({ message }),
  });
}

export async function englishTrainingAppendTurns(
  turns: CommunicationTrainingTurns[],
): Promise<void> {
  await apiFetch<{ ok: boolean }>("/api/speaking-skills/turns/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({ turns }),
  });
}

export async function englishTrainingFinalize(): Promise<{
  ok: boolean;
  analyzed: boolean;
}> {
  return apiFetch<{ ok: boolean; analyzed: boolean }>("/api/speaking-skills/finalize/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({}),
  });
}

// Fire-and-forget finalize that keeps working when the tab is closed, so a
// sudden browser close still tells the backend to re-run Maya's speaking
// analysis over the single EnglishTraining record. Idempotent, so a retry on
// the next page load is harmless.
export function finalizeEnglishTrainingKeepalive(): void {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  const csrfToken = cachedCsrfToken ?? readCookie("csrftoken");
  if (csrfToken) headers.set("X-CSRFToken", csrfToken);
  try {
    void fetch(`${API_BASE}/api/speaking-skills/finalize/`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers,
      body: JSON.stringify({}),
    }).catch(() => {});
  } catch {
    // The tab is going away; this is a final best-effort flush.
  }
}

export type APLRCategory =
  | "quantitative"
  | "logical_reasoning"
  | "verbal"
  | "data_interpretation"
  | "puzzle"
  | "miscellaneous";

export type APLRTrainingStatus = "active" | "solved" | "gave_up";

export type APLRTrainingSession = {
  id: string;
  title: string;
  category: APLRCategory;
  category_label: string;
  question: string;
  answer: string;
  solution: string;
  status: APLRTrainingStatus;
  attempts: number;
  hints_used: number;
  points_awarded: number;
  star_rating: number;
  solved_at: string | null;
  created_at: string;
  updated_at: string;
  transcript?: {
    role: "user" | "assistant";
    content: string;
    created_at: string;
  }[];
};

export type APLRStartResponse = {
  session: APLRTrainingSession;
  message: string;
};

export type APLRChatResponse = {
  session_id: string;
  reply: string;
  solved: boolean;
  gave_up: boolean;
  closed: boolean;
  points_awarded: number;
  star_rating: number;
};

export async function aplrStart(body?: {
  category?: APLRCategory | "";
}): Promise<APLRStartResponse> {
  return apiFetch<APLRStartResponse>("/api/aplr/start/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({ category: body?.category ?? "" }),
  });
}

export async function aplrChat(sessionId: string, message: string): Promise<APLRChatResponse> {
  return apiFetch<APLRChatResponse>("/api/aplr/chat/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({ session_id: sessionId, message }),
  });
}

export async function aplrSkip(sessionId?: string): Promise<{
  ok: boolean;
  skipped: string | number;
  was_active?: boolean;
}> {
  return apiFetch("/api/aplr/skip/", {
    method: "POST",
    body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
  });
}

// Fire-and-forget skip that keeps working when the tab is closed, so leaving
// mid-question still marks the unanswered question as skipped/gave-up.
export function aplrSkipKeepalive(sessionId: string): void {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  const csrfToken = cachedCsrfToken ?? readCookie("csrftoken");
  if (csrfToken) headers.set("X-CSRFToken", csrfToken);
  try {
    void fetch(`${API_BASE}/api/aplr/skip/`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers,
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => {});
  } catch {
    // The tab is going away; this is a final best-effort flush.
  }
}

export async function aplrList(
  params: {
    limit?: number;
    offset?: number;
  } = {},
): Promise<HistoryPage<APLRTrainingSession, PracticeRollupRow>> {
  const search = historyQuery(params);
  return apiFetch<HistoryPage<APLRTrainingSession, PracticeRollupRow>>(
    `/api/aplr/history/${search}`,
  );
}

export async function aplrDetail(sessionId: string): Promise<APLRTrainingSession> {
  const data = await apiFetch<{ session: APLRTrainingSession }>(`/api/aplr/${sessionId}/`);
  return data.session;
}

export type TechnicalCategory =
  "basics" | "arrays_strings" | "searching_sorting" | "recursion" | "algorithms" | "debugging";

export type TechnicalTrainingStatus = "active" | "solved" | "gave_up";

export type TechnicalTrainingSession = {
  id: string;
  title: string;
  category: TechnicalCategory;
  category_label: string;
  question: string;
  answer: string;
  solution: string;
  status: TechnicalTrainingStatus;
  attempts: number;
  hints_used: number;
  points_awarded: number;
  star_rating: number;
  solved_at: string | null;
  created_at: string;
  updated_at: string;
  transcript?: {
    role: "user" | "assistant";
    content: string;
    created_at: string;
  }[];
};

export type TechnicalStartResponse = {
  session: TechnicalTrainingSession;
  message: string;
};

export type TechnicalChatResponse = {
  session_id: string;
  reply: string;
  solved: boolean;
  gave_up: boolean;
  closed: boolean;
  points_awarded: number;
  star_rating: number;
};

export async function technicalStart(body?: {
  category?: TechnicalCategory | "";
}): Promise<TechnicalStartResponse> {
  return apiFetch<TechnicalStartResponse>("/api/technical/start/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({ category: body?.category ?? "" }),
  });
}

export async function technicalChat(
  sessionId: string,
  message: string,
): Promise<TechnicalChatResponse> {
  return apiFetch<TechnicalChatResponse>("/api/technical/chat/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({ session_id: sessionId, message }),
  });
}

export async function technicalSkip(sessionId?: string): Promise<{
  ok: boolean;
  skipped: string | number;
  was_active?: boolean;
}> {
  return apiFetch("/api/technical/skip/", {
    method: "POST",
    body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
  });
}

// Fire-and-forget skip that keeps working when the tab is closed, so leaving
// mid-question still marks the unanswered question as skipped/gave-up.
export function technicalSkipKeepalive(sessionId: string): void {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  const csrfToken = cachedCsrfToken ?? readCookie("csrftoken");
  if (csrfToken) headers.set("X-CSRFToken", csrfToken);
  try {
    void fetch(`${API_BASE}/api/technical/skip/`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers,
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => {});
  } catch {
    // The tab is going away; this is a final best-effort flush.
  }
}

export async function technicalList(
  params: {
    limit?: number;
    offset?: number;
  } = {},
): Promise<HistoryPage<TechnicalTrainingSession, PracticeRollupRow>> {
  const search = historyQuery(params);
  return apiFetch<HistoryPage<TechnicalTrainingSession, PracticeRollupRow>>(
    `/api/technical/history/${search}`,
  );
}

export async function technicalDetail(sessionId: string): Promise<TechnicalTrainingSession> {
  const data = await apiFetch<{ session: TechnicalTrainingSession }>(
    `/api/technical/${sessionId}/`,
  );
  return data.session;
}

export type DSACategory =
  | "arrays_strings"
  | "linked_lists"
  | "stacks_queues"
  | "hash_maps"
  | "trees"
  | "graphs"
  | "searching_sorting"
  | "dynamic_programming";

export type DSATrainingStatus = "active" | "solved" | "gave_up";

export type DSATrainingSession = {
  id: string;
  title: string;
  category: DSACategory;
  category_label: string;
  question: string;
  answer: string;
  solution: string;
  status: DSATrainingStatus;
  attempts: number;
  hints_used: number;
  points_awarded: number;
  star_rating: number;
  solved_at: string | null;
  created_at: string;
  updated_at: string;
  transcript?: {
    role: "user" | "assistant";
    content: string;
    created_at: string;
  }[];
};

export type DSAStartResponse = {
  session: DSATrainingSession;
  message: string;
};

export type DSAChatResponse = {
  session_id: string;
  reply: string;
  solved: boolean;
  gave_up: boolean;
  closed: boolean;
  points_awarded: number;
  star_rating: number;
};

export async function dsaStart(body?: { category?: DSACategory | "" }): Promise<DSAStartResponse> {
  return apiFetch<DSAStartResponse>("/api/dsa/start/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({ category: body?.category ?? "" }),
  });
}

export async function dsaChat(sessionId: string, message: string): Promise<DSAChatResponse> {
  return apiFetch<DSAChatResponse>("/api/dsa/chat/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({ session_id: sessionId, message }),
  });
}

export async function dsaSkip(sessionId?: string): Promise<{
  ok: boolean;
  skipped: string | number;
  was_active?: boolean;
}> {
  return apiFetch("/api/dsa/skip/", {
    method: "POST",
    body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
  });
}

// Fire-and-forget skip that keeps working when the tab is closed, so leaving
// mid-question still marks the unanswered question as skipped/gave-up.
export function dsaSkipKeepalive(sessionId: string): void {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  const csrfToken = cachedCsrfToken ?? readCookie("csrftoken");
  if (csrfToken) headers.set("X-CSRFToken", csrfToken);
  try {
    void fetch(`${API_BASE}/api/dsa/skip/`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers,
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => {});
  } catch {
    // The tab is going away; this is a final best-effort flush.
  }
}

export async function dsaList(
  params: {
    limit?: number;
    offset?: number;
  } = {},
): Promise<HistoryPage<DSATrainingSession, PracticeRollupRow>> {
  const search = historyQuery(params);
  return apiFetch<HistoryPage<DSATrainingSession, PracticeRollupRow>>(`/api/dsa/history/${search}`);
}

export async function dsaDetail(sessionId: string): Promise<DSATrainingSession> {
  const data = await apiFetch<{ session: DSATrainingSession }>(`/api/dsa/${sessionId}/`);
  return data.session;
}

export type BasicMathCategory =
  | "addition_subtraction"
  | "multiplication_division"
  | "fractions_decimals"
  | "percentage"
  | "ratio_average"
  | "mental_math";

export type BasicMathTrainingStatus = "active" | "solved" | "gave_up";

export type BasicMathTrainingSession = {
  id: string;
  title: string;
  category: BasicMathCategory;
  category_label: string;
  question: string;
  answer: string;
  solution: string;
  status: BasicMathTrainingStatus;
  attempts: number;
  hints_used: number;
  points_awarded: number;
  star_rating: number;
  solved_at: string | null;
  created_at: string;
  updated_at: string;
  transcript?: {
    role: "user" | "assistant";
    content: string;
    created_at: string;
  }[];
};

export type BasicMathStartResponse = {
  session: BasicMathTrainingSession;
  message: string;
};

export type BasicMathChatResponse = {
  session_id: string;
  reply: string;
  solved: boolean;
  gave_up: boolean;
  closed: boolean;
  points_awarded: number;
  star_rating: number;
};

export async function basicMathStart(body?: {
  category?: BasicMathCategory | "";
}): Promise<BasicMathStartResponse> {
  return apiFetch<BasicMathStartResponse>("/api/basic-math/start/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({ category: body?.category ?? "" }),
  });
}

export async function basicMathChat(
  sessionId: string,
  message: string,
): Promise<BasicMathChatResponse> {
  return apiFetch<BasicMathChatResponse>("/api/basic-math/chat/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({ session_id: sessionId, message }),
  });
}

export async function basicMathSkip(sessionId?: string): Promise<{
  ok: boolean;
  skipped: string | number;
  was_active?: boolean;
}> {
  return apiFetch("/api/basic-math/skip/", {
    method: "POST",
    body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
  });
}

// Fire-and-forget skip that keeps working when the tab is closed, so leaving
// mid-question still marks the unanswered question as skipped/gave-up.
export function basicMathSkipKeepalive(sessionId: string): void {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  const csrfToken = cachedCsrfToken ?? readCookie("csrftoken");
  if (csrfToken) headers.set("X-CSRFToken", csrfToken);
  try {
    void fetch(`${API_BASE}/api/basic-math/skip/`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers,
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => {});
  } catch {
    // The tab is going away; this is a final best-effort flush.
  }
}

export async function basicMathList(
  params: {
    limit?: number;
    offset?: number;
  } = {},
): Promise<HistoryPage<BasicMathTrainingSession, PracticeRollupRow>> {
  const search = historyQuery(params);
  return apiFetch<HistoryPage<BasicMathTrainingSession, PracticeRollupRow>>(
    `/api/basic-math/history/${search}`,
  );
}

export async function basicMathDetail(sessionId: string): Promise<BasicMathTrainingSession> {
  const data = await apiFetch<{ session: BasicMathTrainingSession }>(
    `/api/basic-math/${sessionId}/`,
  );
  return data.session;
}

// ── Situational Problem Solving Skills (Management) ──────────────────────

export type SituationalCategory =
  | "workplace_conflict"
  | "leadership_dilemma"
  | "team_management"
  | "decision_making"
  | "ethical_dilemma"
  | "crisis_management";

export type SituationalTrainingStatus = "active" | "solved" | "gave_up";

export type SituationalTrainingSession = {
  id: string;
  title: string;
  category: SituationalCategory;
  category_label: string;
  question: string;
  answer: string;
  solution: string;
  status: SituationalTrainingStatus;
  attempts: number;
  hints_used: number;
  points_awarded: number;
  star_rating: number;
  solved_at: string | null;
  created_at: string;
  updated_at: string;
  transcript?: {
    role: "user" | "assistant";
    content: string;
    created_at: string;
  }[];
};

export type SituationalStartResponse = {
  session: SituationalTrainingSession;
  message: string;
};

export type SituationalChatResponse = {
  session_id: string;
  reply: string;
  solved: boolean;
  gave_up: boolean;
  closed: boolean;
  points_awarded: number;
  star_rating: number;
};

export async function situationalStart(body?: {
  category?: SituationalCategory | "";
}): Promise<SituationalStartResponse> {
  return apiFetch<SituationalStartResponse>("/api/situational/start/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({ category: body?.category ?? "" }),
  });
}

export async function situationalChat(
  sessionId: string,
  message: string,
): Promise<SituationalChatResponse> {
  return apiFetch<SituationalChatResponse>("/api/situational/chat/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({ session_id: sessionId, message }),
  });
}

export async function situationalSkip(sessionId?: string): Promise<{
  ok: boolean;
  skipped: string | number;
  was_active?: boolean;
}> {
  return apiFetch("/api/situational/skip/", {
    method: "POST",
    body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
  });
}

// Fire-and-forget skip that keeps working when the tab is closed, so leaving
// mid-question still marks the unanswered question as skipped/gave-up.
export function situationalSkipKeepalive(sessionId: string): void {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  const csrfToken = cachedCsrfToken ?? readCookie("csrftoken");
  if (csrfToken) headers.set("X-CSRFToken", csrfToken);
  try {
    void fetch(`${API_BASE}/api/situational/skip/`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers,
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => {});
  } catch {
    // The tab is going away; this is a final best-effort flush.
  }
}

export async function situationalList(
  params: {
    limit?: number;
    offset?: number;
  } = {},
): Promise<HistoryPage<SituationalTrainingSession, PracticeRollupRow>> {
  const search = historyQuery(params);
  return apiFetch<HistoryPage<SituationalTrainingSession, PracticeRollupRow>>(
    `/api/situational/history/${search}`,
  );
}

export async function situationalDetail(sessionId: string): Promise<SituationalTrainingSession> {
  const data = await apiFetch<{ session: SituationalTrainingSession }>(
    `/api/situational/${sessionId}/`,
  );
  return data.session;
}

export async function transcribeAudio(audioBytes: ArrayBuffer, mime: string): Promise<string> {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Content-Type", mime);
  const csrfToken = cachedCsrfToken ?? readCookie("csrftoken");
  if (csrfToken) headers.set("X-CSRFToken", csrfToken);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/chat/communication/transcribe/`, {
      method: "POST",
      headers,
      credentials: "include",
      body: audioBytes,
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Is the backend running?");
  }

  const data: Record<string, unknown> = await res.json();
  if (!res.ok)
    throw new ApiError(res.status, (data["detail"] as string) || "Transcription failed.");
  return ((data["text"] as string) ?? "").trim();
}

export interface TtsVoice {
  key: string;
  voice: string;
}

export async function ttsVoices(): Promise<TtsVoice[]> {
  const data = await apiFetch<{ voices: TtsVoice[]; default: string }>("/api/chat/tts/voices/");
  return data.voices;
}

export async function ttsGenerate(text: string, voice?: string): Promise<string> {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  const csrfToken = cachedCsrfToken ?? readCookie("csrftoken");
  if (csrfToken) headers.set("X-CSRFToken", csrfToken);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/chat/tts/`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ text, voice: voice ?? "" }),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server.");
  }
  if (res.status === 503) throw new ApiError(503, "TTS unavailable");
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (data["detail"] as string) || "TTS failed.");
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export type TtsWordTiming = { offset: number; startMs: number };

// Per-speaker delivery offsets. Edge serves just one usable Indian male voice,
// so pitch/rate are what distinguish the male panelists from each other. The
// backend clamps both to a natural range and ignores anything invalid.
export type TtsVoiceStyle = { pitchHz?: number; ratePct?: number };

// Same synthesis as ttsGenerate, but asks the backend for the exact start time
// of every word (WordBoundary metadata returned in the X-Word-Times header).
// This lets realtime transcript highlights track the clip precisely instead of
// approximating progress linearly. wordTimes is empty when the backend can't
// provide timings; callers then keep their own fallback.
export async function ttsGenerateWithTimings(
  text: string,
  voice?: string,
  style?: TtsVoiceStyle,
): Promise<{ url: string; wordTimes: TtsWordTiming[] }> {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  const csrfToken = cachedCsrfToken ?? readCookie("csrftoken");
  if (csrfToken) headers.set("X-CSRFToken", csrfToken);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/chat/tts/`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({
        text,
        voice: voice ?? "",
        boundaries: true,
        pitch: style?.pitchHz ?? 0,
        rate: style?.ratePct ?? 0,
      }),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server.");
  }
  if (res.status === 503) throw new ApiError(503, "TTS unavailable");
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (data["detail"] as string) || "TTS failed.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const raw = res.headers.get("X-Word-Times");
  const wordTimes: TtsWordTiming[] = [];
  if (raw) {
    for (const part of raw.split(",")) {
      const sep = part.indexOf(":");
      if (sep <= 0) continue;
      const offset = Number(part.slice(0, sep));
      const startMs = Number(part.slice(sep + 1));
      if (Number.isFinite(offset) && Number.isFinite(startMs)) {
        wordTimes.push({ offset, startMs });
      }
    }
  }
  return { url, wordTimes };
}

/**
 * One page of chat sessions, newest first. `has_more` is the server telling us
 * whether another page exists, so the client never has to guess from the page
 * size (a final page can be short and still have more behind it).
 */
export type ChatSessionPage = {
  sessions: ChatSessionSummary[];
  has_more: boolean;
  offset: number;
  limit: number;
};

export async function chatSessions(
  params: { limit?: number; offset?: number } = {},
): Promise<ChatSessionPage> {
  const { limit, offset } = params;
  const search = new URLSearchParams();
  if (typeof limit === "number") search.set("limit", String(limit));
  if (typeof offset === "number") search.set("offset", String(offset));
  const query = search.toString();
  return apiFetch<ChatSessionPage>(`/api/chat/sessions/${query ? `?${query}` : ""}`);
}

export async function chatSessionDetail(id: string, before?: number | null): Promise<ChatSession> {
  const query = before ? `?before=${before}` : "";
  const data = await apiFetch<{ session: ChatSession }>(`/api/chat/sessions/${id}/${query}`);
  return data.session;
}

export async function deleteChatSession(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/chat/sessions/${id}/`, { method: "DELETE" });
}

export async function summarizeChatSession(
  sessionId?: string | null,
): Promise<{ summary: string | null; changed: string[] }> {
  const body: Record<string, string> = {};
  if (sessionId) body["session_id"] = sessionId;
  return apiFetch<{ summary: string | null; changed: string[] }>("/api/chat/summarize/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify(body),
  });
}

export type RoadmapSelfTrainingModule = {
  required: boolean;
  sessions_per_week?: number;
  focus_areas?: string[];
  notes?: string;
};

export type CandidateRoadmap = {
  id: string;
  source_session: string | null;
  status: string;
  timeline_target: string;
  target_date: string | null;
  company_target: string[];
  goal_statement: string;
  mocks_required: number;
  daily_practice_session_duration: number;
  self_training_required: Record<string, RoadmapSelfTrainingModule>;
  roadmap: Record<string, unknown>;
  summary: string;
  created_at: string;
  updated_at: string;
};

export async function getCandidateRoadmap(): Promise<CandidateRoadmap | null> {
  try {
    const data = await apiFetch<{ roadmap: CandidateRoadmap }>("/api/roadmap/");
    return data.roadmap ?? null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function translateTexts(texts: string[], targetLanguage?: string): Promise<string[]> {
  const body: Record<string, unknown> = { texts };
  if (targetLanguage) body["target_language"] = targetLanguage;
  const data = await apiFetch<{ translations: string[] }>("/api/chat/translate/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify(body),
  });
  return data.translations ?? [];
}

export type OnboardingResponse = {
  reply: string;
  profile_data: Record<string, unknown>;
  summary: string | null;
  complete: boolean;
};

export async function onboardChat(
  messages: ChatMessage[],
  profileData: Record<string, unknown>,
): Promise<OnboardingResponse> {
  return apiFetch<OnboardingResponse>("/api/chat/onboard/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({ messages, profile_data: profileData }),
  });
}

export async function completeOnboarding(
  profileData: Record<string, unknown>,
  messages?: ChatMessage[],
): Promise<CandidateProfilePayload> {
  return apiFetch<CandidateProfilePayload>("/api/chat/complete-onboarding/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({ profile_data: profileData, messages }),
  });
}

export type IdVerificationCheck = {
  matched: boolean;
  detail: string;
};

export type IdVerificationResult = {
  extracted: {
    name: string | null;
    registration_number: string | null;
    college: string | null;
  };
  checks: {
    name: IdVerificationCheck;
    registration_number: IdVerificationCheck;
    college?: IdVerificationCheck;
  };
  all_matched: boolean;
};

export async function verifyIdCard(body: {
  ocr_text: string;
  name: string;
  registration_number: string;
  college?: string;
}): Promise<IdVerificationResult> {
  return apiFetch<IdVerificationResult>("/api/auth/verify-id-card/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify(body),
  });
}

export type CandidateProfile = {
  candidate_id: string;
  phone: string;
  date_of_birth: string | null;
  gender: string;
  college: string;
  department: string;
  program: string;
  start_year: number | null;
  end_year: number | null;
  cgpa: number | null;
  linkedin_url: string;
  github_url: string;
  portfolio_url: string;
  /** The professional headline synced from LinkedIn; editable by the candidate. */
  bio: string;
  skills: string[];
  certifications: string[];
  projects: unknown[];
  internships: unknown[];
  /** Clubs, events and volunteering, edited as tags on the candidate's profile. */
  extracurricular_activities: string[];
  preferred_roles: string[];
  preferred_locations: string[];
  preferred_language: string;
  expected_ctc: number | null;
  time_spent: number;
  personal_email: string;
  placement_status: string;
  placement_eligible: boolean;
  first_name: string;
  middle_name: string;
  last_name: string;
  full_name: string;
};

export type ProfileStats = {
  chat_sessions: number;
  chat_messages: number;
};

export type PerformanceModule = {
  key: string;
  label: string;
  score: number;
};

export type PerformanceComponents = {
  score: number;
  coverage: number;
  mock_interview: number | null;
  mock_interviews: number;
  self_training: number | null;
  chat: number | null;
  chat_messages: number;
  chat_sessions: number;
  modules: PerformanceModule[];
};

export type PillarRank = {
  score: number | null;
  rank: number | null;
  total: number;
  department_rank: number | null;
  department_total: number;
};

// Each pillar is ranked over its own cohort — mock-interview and self-training
// standings never move each other, and neither one is the composite score.
export type PillarRanks = {
  mock_interview: PillarRank | null;
  self_training: PillarRank | null;
};

export type ProfileRanks = {
  score: number | null;
  department: number | null;
  overall: number | null;
  total: number;
  department_total: number;
  pillars: PillarRanks;
};

export type CandidateProfilePayload = {
  user: {
    id: number;
    email: string;
    name: string;
    avatar?: string;
    first_name: string;
    date_joined: string;
    last_login: string | null;
  };
  profile: CandidateProfile | null;
  ranks: ProfileRanks;
  performance: PerformanceComponents | null;
  stats: ProfileStats;
  profile_complete: boolean;
  missing_fields: string[];
};

export async function getProfile(): Promise<CandidateProfilePayload> {
  return apiFetch<CandidateProfilePayload>("/api/auth/profile/");
}

export async function updateProfile(
  body: Record<string, unknown>,
): Promise<CandidateProfilePayload> {
  return apiFetch<CandidateProfilePayload>("/api/auth/profile/", {
    method: "PATCH",
    // Saving may trigger a slow LinkedIn-photo fetch on the server, so use the
    // long timeout reserved for LLM-backed endpoints.
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify(body),
  });
}

export type BuildResumeResult = {
  ok: boolean;
  linkedin_url: string;
  /** The resume sections the server found in the scrape, by name. */
  sections: string[];
  logged: boolean;
  /** Backend path of the generated PDF, to hand to the browser as a download. */
  pdf_url: string;
};

// Ask the backend to scrape the candidate's LinkedIn profile, merge it with their
// TalentBro profile, and render the result to a PDF. The LinkedIn URL is optional:
// the backend falls back to the one already saved on the candidate's profile.
export async function buildResume(linkedinUrl?: string): Promise<BuildResumeResult> {
  await ensureCsrfCookie();
  return apiFetch<BuildResumeResult>("/api/resume/build/", {
    method: "POST",
    // The server runs a full Apify scrape and renders a PDF, so allow well past
    // the default timeout.
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify(linkedinUrl ? { linkedin_url: linkedinUrl } : {}),
  });
}

export type InstitutionMeta = {
  name: string;
  departments: string[];
};

export async function searchInstitutions(query: string): Promise<InstitutionMeta[]> {
  const data = await apiFetch<{ institutions: InstitutionMeta[] }>(
    `/api/institutions/?q=${encodeURIComponent(query)}`,
  );
  return data.institutions;
}

export async function institutionCompanies(): Promise<string[]> {
  const data = await apiFetch<{ companies: string[] }>("/api/institutions/companies/");
  return data.companies;
}

export async function candidateCompanies(): Promise<string[]> {
  const data = await apiFetch<{ companies: string[] }>("/api/candidate/companies/");
  return data.companies;
}

export type Institution = {
  name: string;
  institution_type: string;
  website: string;
  email_domain: string;
  address: string;
  city: string;
  state: string;
  pin_code: string;
  logo?: string;
  placement_department_name: string;
  placement_office_email: string;
  approximate_student_strength: number | null;
};

export type ClientProfile = {
  id: number;
  institution_name: string | null;
  full_name: string;
  official_email: string;
  avatar?: string;
  mobile_number: string;
  designation: string;
  employee_staff_id: string;
  access: "beta" | "master";
  has_master_access: boolean;
  institution?: Institution;
};

export async function clientOnboarding(body: Record<string, unknown>): Promise<AuthUser> {
  const data = await apiFetch<{ user: AuthUser }>("/api/auth/client-onboarding/", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.user;
}

export type MockInterviewStatus = "active" | "completed" | "not_scored";
export type MockInterviewDuration = "short" | "standard" | "long";
export type PanelistId = "atlas" | "maya" | "albert" | "peter" | "daniel" | "ada" | "carl";

export type MockInterview = {
  id: string;
  company_name: string;
  role: string;
  questions: string[];
  duration: MockInterviewDuration;
  panelists: PanelistId[];
  panelist_response: Record<PanelistId, string>;
  suspection: number;
  status: MockInterviewStatus;
  created_at: string;
  updated_at: string;
  message_count: number;
};

export type ServerMockMessage = ChatMessage & {
  panelist?: string;
  tone?: string;
  created_at: string;
};

export type MockInterviewDetail = MockInterview & {
  messages: ServerMockMessage[];
  analysis?: MockInterviewAnalysis | null;
};

export type MockInterviewAnalysisMetric = {
  dimension: string;
  description: string;
  percentage: number;
};

export type MockInterviewSwot = {
  strengths: string;
  weaknesses: string;
  opportunities: string;
  threats: string;
};

// One improvement area written by a single reviewing panelist (never Atlas,
// who only hosts the session). Only panelists who sat on that interview and
// actually produced a remark are sent.
export type MockInterviewPanelistRemark = {
  panelist: string;
  name: string;
  remark: string;
};

export type MockInterviewAnalysis = {
  id: string;
  company_name: string;
  role: string;
  created_at: string;
  // Moderated score for the interview, or null when the candidate never gave
  // enough real answers for one to exist. Never derive a score client-side.
  overall_score: number | null;
  scored_dimensions: number;
  total_dimensions: number;
  metrics: MockInterviewAnalysisMetric[];
  improvements: MockInterviewPanelistRemark[];
  swot: MockInterviewSwot;
};

export type MockInterviewStartResponse = {
  interview: MockInterviewDetail;
  reply: string;
  panelist: string;
};

// One interview as the history rollup sees it. `analysis` is null whenever the
// interview was never scored, which is different from scoring zero.
export type MockInterviewStatsEntry = MockInterview & {
  user_turns: number;
  assistant_turns: number;
  user_words: number;
  // Midpoint of the exchange count this interview's length was briefed for, so
  // a short session is never judged against a long session's target.
  target_exchanges: number;
  analysis: {
    overall_score: number;
    scored_dimensions: number;
    total_dimensions: number;
    // Keyed by the rubric's display name, and only for dimensions the stored
    // analysis carries evidence for, so the client can group them into its own
    // categories without fetching each interview's full report.
    dimensions: Record<string, number>;
  } | null;
};

/**
 * One scored interview, reduced to what the history charts need. Sent whole
 * (never paged) because both the trend line and the skills radar describe the
 * candidate's entire record and would otherwise change as they scroll.
 */
export type MockInterviewScoredPoint = {
  company_name: string;
  created_at: string;
  score: number;
  dimensions: Record<string, number>;
};

// The whole mock-interview record reduced to counts and means on the server.
// Nothing in here is generated: opening the history never calls the model, and
// every score it reports was written when the interview was finalised.
export type MockInterviewStats = {
  totals: {
    interviews: number;
    completed: number;
    not_scored: number;
    active: number;
    scored: number;
    violations: number;
    user_turns: number;
    assistant_turns: number;
    user_words: number;
    companies: number;
    roles: number;
    /** Mean answer depth over finished interviews, or null when there are none. */
    avg_depth: number | null;
  };
  tones: { positive: number; neutral: number; negative: number };
  /**
   * One page of the "All interviews" list, newest first. The rollups beside it
   * always describe the *whole* record; only this array is paged.
   */
  interviews: MockInterviewStatsEntry[];
  has_more: boolean;
  total: number;
  offset: number;
  limit: number;
  /** Whole record, oldest first. Feeds the trend chart and the skills radar. */
  scored: MockInterviewScoredPoint[];
  by_company: {
    name: string;
    interviews: number;
    avg_user_turns: number;
    avg_score: number | null;
    scored: number;
  }[];
  by_role: {
    name: string;
    interviews: number;
    avg_user_turns: number;
    avg_score: number | null;
    scored: number;
  }[];
};

export async function startMockInterview(body: {
  company_name: string;
  role?: string;
  questions: string[];
  questionText?: string;
  duration?: MockInterviewDuration;
  panelists?: PanelistId[];
}): Promise<MockInterviewStartResponse> {
  return apiFetch<MockInterviewStartResponse>("/api/interview/start/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({
      company_name: body.company_name,
      role: body.role ?? "",
      questions: body.questionText
        ? body.questionText
            .split(/\n+/)
            .map((q) => q.trim())
            .filter(Boolean)
        : body.questions,
      duration: body.duration ?? "standard",
      panelists: body.panelists ?? [],
    }),
  });
}

export async function replyMockInterview(
  interviewId: string,
  answer: string,
): Promise<{
  reply: string;
  panelist: string;
  done: boolean;
  tone?: string;
  analysis?: MockInterviewAnalysis | null;
}> {
  return apiFetch<{
    reply: string;
    panelist: string;
    done: boolean;
    tone?: string;
    analysis?: MockInterviewAnalysis | null;
  }>("/api/interview/reply/", {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({ interview_id: interviewId, answer }),
  });
}

export async function resumeMockInterview(interviewId: string): Promise<{
  reply: string;
  panelist: string;
  done: boolean;
  tone?: string;
}> {
  return apiFetch<{
    reply: string;
    panelist: string;
    done: boolean;
    tone?: string;
  }>(`/api/interview/${interviewId}/resume/`, {
    method: "POST",
    timeoutMs: LONG_TIMEOUT_MS,
  });
}

export async function mockInterviews(): Promise<MockInterview[]> {
  const data = await apiFetch<{ interviews: MockInterview[] }>("/api/interview/");
  return data.interviews;
}

export async function mockInterviewDetail(id: string): Promise<MockInterviewDetail> {
  const data = await apiFetch<{ interview: MockInterviewDetail }>(`/api/interview/${id}/`);
  return data.interview;
}

export async function mockInterviewAnalysis(id: string): Promise<MockInterviewAnalysis | null> {
  const data = await apiFetch<{ analysis: MockInterviewAnalysis | null }>(
    `/api/interview/${id}/analysis/`,
  );
  return data.analysis;
}

export async function deleteMockInterview(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/interview/${id}/`, { method: "DELETE" });
}

export async function completeMockInterview(id: string): Promise<MockInterview> {
  const data = await apiFetch<{ interview: MockInterview }>(`/api/interview/${id}/`, {
    method: "PATCH",
    timeoutMs: LONG_TIMEOUT_MS,
    body: JSON.stringify({ status: "completed" }),
  });
  return data.interview;
}

// Fire-and-forget end that keeps working when the tab is closed, so a sudden
// browser close still tells the backend to lock the interview as completed and
// auto-fill the analysis / panelist feedback — exactly the same as ending it
// through the UI. The backend finalizer is idempotent, so a later retry is harmless.
export function completeMockInterviewKeepalive(id: string): void {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  const csrfToken = cachedCsrfToken ?? readCookie("csrftoken");
  if (csrfToken) headers.set("X-CSRFToken", csrfToken);
  try {
    void fetch(`${API_BASE}/api/interview/${id}/`, {
      method: "PATCH",
      credentials: "include",
      keepalive: true,
      headers,
      body: JSON.stringify({ status: "completed" }),
    }).catch(() => {});
  } catch {
    // The tab is going away; this is a final best-effort flush.
  }
}

export async function recordViolation(id: string): Promise<MockInterview> {
  const data = await apiFetch<{ interview: MockInterview }>(`/api/interview/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ suspection: true }),
  });
  return data.interview;
}

/**
 * One request for everything the interview history screen shows. The server
 * reduces the candidate's whole record to counts and means, so this stays a
 * single cheap read instead of fanning out one analysis call per interview.
 *
 * Deliberately a plain GET against `/api/interview/stats/` and NOT a loop over
 * `mockInterviewAnalysis()`: that endpoint generates an analysis on read when
 * one is missing, which would spend model time and invent numbers the
 * candidate never earned. This one only ever reads what is already stored.
 */
export async function mockInterviewStats(
  params: {
    limit?: number;
    offset?: number;
  } = {},
): Promise<MockInterviewStats> {
  const { limit, offset } = params;
  const search = new URLSearchParams();
  if (typeof limit === "number") search.set("limit", String(limit));
  if (typeof offset === "number") search.set("offset", String(offset));
  const query = search.toString();
  return apiFetch<MockInterviewStats>(`/api/interview/stats/${query ? `?${query}` : ""}`);
}

export type NotificationSender = "Placement Cell" | "TalentBro Platform";

export type NotificationItem = {
  id: string;
  sender: NotificationSender;
  title: string;
  body: string;
  pinned: boolean;
  important: boolean;
  read: boolean;
  time: string;
  created_at: string;
  redirect_path: string;
};

export type NotificationPage = {
  notifications: NotificationItem[];
  unread: number;
  total: number;
  has_more: boolean;
  offset: number;
  limit: number;
};

export type NotificationFeedFilters = {
  sender?: NotificationSender;
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
};

export async function getNotificationPage(
  filters: NotificationFeedFilters = {},
): Promise<NotificationPage> {
  const params = new URLSearchParams();
  if (filters.sender) params.set("sender", filters.sender);
  if (filters.unreadOnly) params.set("unread", "true");
  if (filters.limit != null) params.set("limit", String(filters.limit));
  if (filters.offset != null) params.set("offset", String(filters.offset));
  const qs = params.toString();
  return apiFetch<NotificationPage>(qs ? `/api/notifications/?${qs}` : "/api/notifications/");
}

/**
 * The bare feed, used as a react-query `queryFn` by the dash `Shell` and the
 * unread badge in `app-nav`, both of which only read `unread` (react-query
 * passes the query context object as the argument, which this ignores).
 */
export function getNotifications(): Promise<{ notifications: NotificationItem[]; unread: number }> {
  return getNotificationPage();
}

export async function markNotificationsRead(notificationId?: string, all = false): Promise<void> {
  const body = all ? { all: true } : { notification_id: notificationId };
  await apiFetch<{ ok: boolean }>("/api/notifications/mark-read/", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// A broadcast authored by institution staff. The backend fans it out to the
// signed-in staff member's own feed; students receive it as a placement-cell
// notification.
export type BroadcastDraft = {
  title: string;
  body: string;
  pinned?: boolean;
  important?: boolean;
};

export async function createNotification(draft: BroadcastDraft): Promise<NotificationItem> {
  const data = await apiFetch<{ notification: NotificationItem }>("/api/notifications/", {
    method: "POST",
    body: JSON.stringify(draft),
  });
  return data.notification;
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await apiFetch(`/api/notifications/${encodeURIComponent(notificationId)}/`, { method: "DELETE" });
}

export type DriveCompanyTier = "super_dream" | "dream" | "core" | "mass";

// A registered recruiter. This is the standing relationship only - roles,
// skills, dates, rounds, status and offer state belong to a PlacementDrive,
// created when the company actually goes to hire.

// One Gemini-written profile block. The shape is fixed by the backend
// (Company.AI_INFO_KEYS) and every block carries all four keys.
export type CompanyAiInfoBlock = {
  name: string;
  short_desc: string;
  known_for: string;
  big_desc: string;
};

export type PlacementCompany = {
  id: number;
  company_id: string;
  company_name: string;
  industry: string;
  company_description: string;
  // Typed by the placement cell, stored as given. Read the normalised origin off
  // the backend's company.website value when linking anywhere.
  website: string;
  // Favicon URL resolved server-side from `website`. Empty when no website was
  // given or the lookup found nothing, so the UI falls back to a monogram.
  company_logo: string;
  // Generated right after the company is registered, so this is usually empty
  // on the create response and filled in on a later read.
  company_ai_info: CompanyAiInfoBlock[];
  eligible_courses: string[];
  eligible_branches: string[];
  minimum_cgpa: number | null;
  maximum_backlogs: number | null;
  graduation_year: number | null;
  salary_min: number | null;
  salary_max: number | null;
  work_location: string;
  // Sum of the vacancies across the company's Drive rows. Zero when the
  // company has no drives yet.
  openings: number | null;
  drive_count: number | null;
  tier: DriveCompanyTier;
  institution: string | null;
  created_at: string;
  updated_at: string;
};

export async function getCompanies(): Promise<{ companies: PlacementCompany[]; count: number }> {
  return apiFetch<{ companies: PlacementCompany[]; count: number }>("/api/companies/");
}

// Every field the placement cell can record for a campus partner. The backend
// stores blanks as null, so an omitted key and an explicit null are equivalent —
// never send an empty string for a numeric/date field. Registering a company
// only records the relationship; the hiring detail is set on a Drive.
export type CompanyCreatePayload = {
  company_name: string;
  company_id?: string;
  industry?: string;
  company_description?: string;
  // Optional, and forgiving: a bare domain is fine. The backend reduces it to an
  // origin and resolves the favicon from it, so the logo needs no field here.
  website?: string;
  work_location?: string;
  tier?: DriveCompanyTier;
  salary_min?: number | null;
  salary_max?: number | null;
  eligible_courses?: string[];
  eligible_branches?: string[];
  minimum_cgpa?: number | null;
  maximum_backlogs?: number | null;
  graduation_year?: number | null;
};

export async function createCompany(payload: CompanyCreatePayload): Promise<PlacementCompany> {
  const data = await apiFetch<{ company: PlacementCompany }>("/api/companies/create/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.company;
}

// An edit re-sends the same field set. The identity fields (company_id, the
// owning client and institution) are fixed at registration and ignored here.
export type CompanyUpdatePayload = CompanyCreatePayload;

export async function updateCompany(
  id: number,
  payload: CompanyUpdatePayload,
): Promise<PlacementCompany> {
  const data = await apiFetch<{ company: PlacementCompany }>(
    `/api/companies/${encodeURIComponent(String(id))}/update/`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
  return data.company;
}

// ── Institution dashboards (staff side) ───────────────────────────────────

export type DashboardInstitution = {
  name: string;
  institution_type: string;
  website: string;
  email_domain: string;
  address: string;
  city: string;
  state: string;
  pin_code: string;
  logo?: string;
  placement_department_name: string;
  placement_office_email: string;
  approximate_student_strength: number | null;
  courses_offered: string[];
  departments: string[];
};

export type DashboardClient = {
  full_name: string;
  official_email: string;
  mobile_number: string;
  designation: string;
  employee_staff_id: string;
  access: "beta" | "master";
  is_master: boolean;
};

export type OverviewKpis = {
  total_students: number;
  eligible_students: number;
  placed: number;
  in_selection: number;
  applied: number;
  avg_cgpa: number | null;
  highest_cgpa: number | null;
  avg_expected_ctc: number | null;
  recruiters: number;
  active_drives: number;
  total_openings: number;
  super_dream: number;
};

export type FunnelStage = { stage: string; value: number };
export type MonthlyPoint = { month: string; students: number };

export type DepartmentStat = {
  department: string;
  short: string;
  total: number;
  eligible: number;
  placed: number;
  rate: number;
  avg_cgpa: number;
  avg_expected_ctc: number;
};

export type InstitutionOverview = {
  institution: DashboardInstitution;
  client: DashboardClient | null;
  kpis: OverviewKpis;
  funnel: FunnelStage[];
  monthly: MonthlyPoint[];
  departments: DepartmentStat[];
  tiers: { tier: DriveCompanyTier; label: string; count: number }[];
  batch: { year: number; students: number };
};

export async function getInstitutionOverview(): Promise<InstitutionOverview> {
  return apiFetch<InstitutionOverview>("/api/institution/overview/");
}

/**
 * Fields the placement cell may correct on its own college record.
 *
 * Every key is optional and only the ones sent are written, so the dialog can
 * save a whole form or a single correction. `email_domain` and `logo` are
 * absent on purpose: the domain decides which sign-in addresses staff can be
 * invited on, and moving it would orphan addresses already handed out.
 */
export type InstitutionUpdatePayload = {
  name?: string;
  institution_type?: string;
  placement_department_name?: string;
  placement_office_email?: string;
  address?: string;
  city?: string;
  state?: string;
  pin_code?: string;
  // Explicitly allows undefined: clearing the field in the form has to be able
  // to send "no value", which exactOptionalPropertyTypes otherwise forbids.
  approximate_student_strength?: number | undefined;
  courses_offered?: string[];
  departments?: string[];
};

/**
 * Save the college record. Master access only; a Beta account gets a 403 and
 * the message the server sends, which is what the dialog shows.
 */
export async function updateInstitution(
  payload: InstitutionUpdatePayload,
): Promise<DashboardInstitution> {
  const data = await apiFetch<{ institution: DashboardInstitution }>("/api/institution/update/", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return data.institution;
}

/**
 * The institution's pay-as-you-go bill: the live sum of `cost_incurred` over
 * every candidate in the college, plus the advance credit to knock off it.
 *
 * `advance_paid` comes from the server rather than being hardcoded in the UI so
 * the amount deducted can never disagree between the two sides.
 */
export type InstituteBilling = {
  institution: {
    name: string;
    institution_type: string;
    logo: string;
  };
  /** Sum of every candidate profile's cost consumed, in INR. */
  total_cost_consumed: number;
  /** Largest single-candidate cost, for the "most used student" figure. */
  highest_candidate_cost: number;
  /** Mean cost across the roll; 0 when the institute has no candidates. */
  average_candidate_cost: number;
  candidate_count: number;
  /** Candidates who have burnt any cost at all. */
  candidates_with_cost: number;
  advance_paid: number;
  generated_at: string;
};

export async function getInstituteBilling(): Promise<InstituteBilling> {
  return apiFetch<InstituteBilling>("/api/institution/billing/");
}

// One member of the placement department. Members are ordinary ClientProfile
// rows sharing the institution, so adding someone puts them straight into the
// same dashboards.
export type PlacementCellMember = {
  id: number;
  /** Null until the invited person signs up with this email. */
  user_id: number | null;
  full_name: string;
  official_email: string;
  mobile_number: string;
  designation: string;
  employee_staff_id: string;
  avatar: string;
  access: "beta" | "master";
  is_master: boolean;
  /** False while the roster entry is an invite nobody has signed up for yet. */
  has_account: boolean;
  created_at: string | null;
};

export type PlacementCellMembers = {
  members: PlacementCellMember[];
  count: number;
  // Whether this account is a Master owner, i.e. may add more members. The UI
  // gates the "Add member" button on exactly this.
  can_add_members: boolean;
};

export async function getPlacementCellMembers(): Promise<PlacementCellMembers> {
  return apiFetch<PlacementCellMembers>("/api/placement-cell/members/");
}

export type PlacementCellMemberPayload = {
  full_name: string;
  official_email: string;
  designation: string;
  mobile_number: string;
  employee_staff_id?: string;
  // Master only; anything else falls back to "beta" server-side.
  access?: "beta" | "master";
};

// No account is created here: the endpoint records the person on the college's
// roster only. They sign up themselves with the same email and set their own
// password, which claims the roster entry.
export type PlacementCellMemberCreated = {
  member: PlacementCellMember;
};

export async function addPlacementCellMember(
  payload: PlacementCellMemberPayload,
): Promise<PlacementCellMemberCreated> {
  const data = await apiFetch<PlacementCellMemberCreated>("/api/placement-cell/members/create/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data;
}

/**
 * Take one member off the college's roster. Master access only, and the server
 * refuses to remove the caller or the last remaining Master - so a rejected
 * delete comes back as a message to show, not as a silent no-op.
 */
export async function removePlacementCellMember(id: number): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/placement-cell/members/${id}/`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Classroom L&D sessions
// ---------------------------------------------------------------------------

/** One scheduled classroom session on the L&D board. */
export type ClassroomLDSession = {
  id: string;
  topic: string;
  agenda: string;
  venue: string;
  /** Free text, so a session can be campus-wide rather than tied to a course. */
  department: string;
  faculty_name: string;
  /** ISO stamp from the server; display fields below are pre-formatted for the UI. */
  starts_at: string;
  ends_at: string;
  starts_at_display: string;
  starts_at_time: string;
  ends_at_time: string;
  duration_minutes: number;
  /** True once the session's end time has passed. */
  is_past: boolean;
  created_at: string | null;
};

export type ClassroomLDSessions = {
  /** Sorted soonest-first, sessions that have not finished yet. */
  upcoming: ClassroomLDSession[];
  /** Sorted most-recent-first, sessions that have already finished. */
  done: ClassroomLDSession[];
  counts: {
    upcoming: number;
    done: number;
  };
};

export async function getClassroomLDSessions(): Promise<ClassroomLDSessions> {
  return apiFetch<ClassroomLDSessions>("/api/classroom-ld-sessions/");
}

export type ClassroomLDSessionPayload = {
  topic: string;
  /** ISO stamps. `datetime-local` input values are sent through `new Date(...)`. */
  starts_at: string;
  ends_at: string;
  agenda?: string;
  venue?: string;
  department?: string;
  faculty_name?: string;
};

export type ClassroomLDSessionCreated = {
  session: ClassroomLDSession;
};

export async function addClassroomLDSession(
  payload: ClassroomLDSessionPayload,
): Promise<ClassroomLDSessionCreated> {
  return apiFetch<ClassroomLDSessionCreated>("/api/classroom-ld-sessions/create/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function removeClassroomLDSession(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/classroom-ld-sessions/${id}/`, { method: "DELETE" });
}

export type PlacementStatus = "not_started" | "applying" | "shortlisted" | "placed";

export type StudentRecord = {
  id: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  full_name: string;
  /**
   * The professional headline, visible to every user who can see this student
   * (leaderboard, student detail, staff directory). Candidate-editable, so it
   * can be blank until they fill it in.
   */
  bio: string;
  department: string | null;
  program: string | null;
  start_year: number | null;
  end_year: number | null;
  mobile_number: string;
  /** Profile photo URL; empty when the student has not uploaded one. */
  avatar?: string;
  gender: string;
  cgpa: number | null;
  placement_status: PlacementStatus;
  // Resolved server-side from the readiness score (score >= 40, and a score must
  // exist). There is no stored boolean and no override, so this flag is the rule.
  placement_eligible: boolean;
  skills: string[];
  preferred_roles: string[];
  preferred_locations: string[];
  preferred_language: string;
  /** Clubs, competitions, events and volunteering the student took part in. */
  extracurricular_activities: string[];
  expected_ctc: number | null;
  /** Lifetime minutes spent on the platform, cumulative across sessions. */
  time_spent: number;
  /** Total Gemini spend burnt by this student in INR, including the 40% margin. */
  cost_incurred: number;
  account_status: string;
  created_at: string;
  performance_score: number | null;
  performance: PerformanceComponents | null;
  overall_rank: number | null;
  department_rank: number | null;
  overall_total: number;
  department_total: number;
  // Independent mock-interview and self-training standings, each ranked over
  // its own cohort.
  pillars: PillarRanks;
};

export type StudentsResponse = {
  students: StudentRecord[];
  // Rows matching the active filters, versus every candidate profile the
  // college has, so the UI can show the real student count alongside the view.
  count: number;
  total: number;
  // The institution's approximate student strength, which can exceed the number
  // of candidate profiles actually in the database.
  approximate_student_strength: number | null;
};

export type StudentsQuery = {
  q?: string;
  dept?: string;
  status?: string;
  min_cgpa?: number;
  eligible?: boolean;
  sort?: "name" | "cgpa" | "expected_ctc" | "performance";
};

export async function getStudents(query: StudentsQuery = {}): Promise<StudentsResponse> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.dept && query.dept !== "All") params.set("dept", query.dept);
  if (query.status && query.status !== "All") params.set("status", query.status);
  if (query.min_cgpa && query.min_cgpa > 0) params.set("min_cgpa", String(query.min_cgpa));
  if (query.eligible) params.set("eligible", "1");
  if (query.sort) params.set("sort", query.sort);
  const qs = params.toString();
  return apiFetch<StudentsResponse>(`/api/students/${qs ? `?${qs}` : ""}`);
}

export type AddStudentsResult = {
  created: number;
  skipped: number;
  invalid: string[];
  total: number;
};

// Add students to the signed-in staff member's own institution. The addresses
// are the only thing collected, so each one becomes a bare profile row that the
// student completes themselves.
export async function addStudents(emails: string[]): Promise<AddStudentsResult> {
  return apiFetch<AddStudentsResult>("/api/students/add/", {
    method: "POST",
    body: JSON.stringify({ emails }),
  });
}

export type ExistingStudent = {
  email: string;
  college: string;
  website: string;
  same_college: boolean;
};

export type CheckStudentsResult = {
  existing: ExistingStudent[];
  available: number;
};

// Ask which of these addresses already sit on a candidate profile, so the
// directory can say so before anything is written rather than skipping on save.
export async function checkStudentsExist(emails: string[]): Promise<CheckStudentsResult> {
  return apiFetch<CheckStudentsResult>("/api/students/check/", {
    method: "POST",
    body: JSON.stringify({ emails }),
  });
}

/** One "code, label" pair straight off a Django choices tuple. */
export type ChoicePair = [string, string];

/** The signed-in student's own auth account, as the staff record view sees it. */
export type StudentAccount = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  is_staff: boolean;
  date_joined: string | null;
  last_login: string | null;
};

/**
 * Every column on one CandidateProfile, as stored. The directory table only
 * shows a handful; this is the full record a placement-cell officer reviews.
 */
export type StudentDetail = {
  id: string;
  full_name: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  college: string;
  college_id: string | null;
  department: string;
  program: string;
  start_year: number | null;
  end_year: number | null;
  personal_email: string | null;
  mobile_number: string;
  avatar: string | null;
  bio: string;
  date_of_birth: string | null;
  gender: string;
  cgpa: number | null;
  placement_status: string;
  placement_eligible: boolean;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  skills: string[];
  certifications: string[];
  projects: unknown[];
  internships: unknown[];
  extracurricular_activities: string[];
  preferred_roles: string[];
  preferred_locations: string[];
  preferred_language: string;
  expected_ctc: number | null;
  time_spent: number;
  account_status: string;
  last_login_at: string | null;
  cost_incurred: number;
  readiness_score: number | null;
  readiness_overall_rank: number | null;
  readiness_overall_total: number;
  readiness_department_rank: number | null;
  readiness_department_total: number;
  readiness_components: Record<string, unknown>;
  readiness_updated_at: string | null;
  mock_interview_score: number | null;
  mock_interview_rank: number | null;
  mock_interview_total: number;
  mock_interview_department_rank: number | null;
  mock_interview_department_total: number;
  self_training_score: number | null;
  self_training_rank: number | null;
  self_training_total: number;
  self_training_department_rank: number | null;
  self_training_department_total: number;
  created_at: string | null;
  updated_at: string | null;
  /** False while the student is an email-only invite with no account yet. */
  has_account: boolean;
  account: StudentAccount | null;
  ranks: ProfileRanks;
  /** Option lists behind the choice columns, so codes can print as labels. */
  choices: {
    gender: ChoicePair[];
    program: ChoicePair[];
    placement_status: ChoicePair[];
    account_status: ChoicePair[];
  };
};

export type StudentDetailResponse = {
  student: StudentDetail;
  activity_url: string;
};

export async function getStudentData(studentId: string): Promise<StudentDetailResponse> {
  return apiFetch<StudentDetailResponse>(`/api/students/${studentId}/`);
}

/** Key of one practice module; matches the per-module summary shapes below. */
export type ActivityModuleKey =
  | "mock_interview"
  | "aplr"
  | "basic_math"
  | "situational"
  | "technical"
  | "dsa"
  | "communication"
  | "english"
  | "gd";

/** Latest / best / first score of a module, plus the mean across all of it. */
export type ScoreTrend = {
  avg_score: number | null;
  latest_score: number | null;
  best_score: number | null;
  first_score: number | null;
};

export type MockInterviewSummary = ScoreTrend & {
  sessions: number;
  completed: number;
  scored: number;
  completion_rate: number | null;
};

export type QuestionModuleSummary = {
  sessions: number;
  solved: number;
  gave_up: number;
  active: number;
  solve_rate: number | null;
  avg_attempts: number | null;
  avg_hints_used: number | null;
  avg_points_awarded: number | null;
  avg_star_rating: number | null;
};

/** Communication, English and GD all add a per-criterion mean block. */
export type ScoredModuleSummary = ScoreTrend & {
  sessions: number;
  analyzed?: number;
  avg_duration_minutes?: number | null;
  averages: Record<string, number>;
};

export type ActivityModuleSummary =
  MockInterviewSummary | QuestionModuleSummary | ScoredModuleSummary;

export type GdCriterionScore = { label: string; score: number | null };

/**
 * One practice session, flattened out of whichever table it came from. The
 * fields that only some modules have are optional for the same reason.
 */
export type ActivitySession = {
  module: ActivityModuleKey;
  module_label: string;
  id: string;
  title: string;
  created_at: string;
  updated_at?: string;
  // Mock interview.
  company_name?: string | null;
  role?: string | null;
  duration?: string | null;
  suspicion?: number;
  panelists?: string[];
  message_count?: number;
  scored_dimensions?: number;
  // APLR / Basic Math / Situational / Technical / DSA.
  topic?: string | null;
  category?: string | null;
  attempts?: number;
  hints_used?: number;
  points_awarded?: number;
  star_rating?: number;
  solved_at?: string | null;
  // Communication / English / GD.
  phase?: string | null;
  communication_score?: number | null;
  writing_score?: number | null;
  duration_minutes?: number | null;
  grade?: string | null;
  ended_at?: string | null;
  finalized_at?: string | null;
  scores?: Record<string, number | null>;
  criteria?: GdCriterionScore[];
  // Shared.
  status: string;
  overall_score: number | null;
};

export type StudentActivityResponse = {
  student: {
    id: string;
    full_name: string;
    department?: string;
    program?: string;
    end_year?: number | null;
    has_account: boolean;
  };
  modules: { key: ActivityModuleKey; label: string; summary: ActivityModuleSummary }[];
  sessions: ActivitySession[];
  totals: {
    sessions: number;
    modules_used: number;
    last_activity_at: string | null;
  };
  /** True when the record is longer than the response cap. */
  truncated: boolean;
};

export async function getStudentActivity(studentId: string): Promise<StudentActivityResponse> {
  return apiFetch<StudentActivityResponse>(`/api/student-activity/${studentId}/`);
}

/**
 * The evidence behind one mock-interview session card: the whole stored
 * transcript, in order, plus the panel's own closing remarks. Scoped on the
 * server to the signed-in officer's own college.
 */
export type StudentInterviewEvidenceResponse = {
  student: { id: string; full_name: string };
  interview: MockInterviewDetail;
};

export async function getStudentInterviewEvidence(
  interviewId: string,
): Promise<StudentInterviewEvidenceResponse> {
  return apiFetch<StudentInterviewEvidenceResponse>(
    `/api/student-interview/${interviewId}/evidence/`,
  );
}

/** One turn of a practice question's chat, exactly as the student chat stored it. */
export type QuestionSessionTurn = {
  role: string;
  content: string;
  created_at: string | null;
};

/**
 * The evidence behind one question-module session card — APLR, Basic Math,
 * Situational Problem Solving, Technical / Coding and DSA: the question as it
 * was asked, every reply the student wrote, and the answer and solution stored
 * against it. Scoped on the server to the signed-in officer's own college.
 */
export type QuestionSessionEvidenceResponse = {
  student: { id: string; full_name: string };
  module: ActivityModuleKey;
  module_label: string;
  session: {
    id: string;
    title: string;
    category: string | null;
    status: string;
    question: string;
    answer: string;
    solution: string;
    transcript: QuestionSessionTurn[];
    attempts: number;
    hints_used: number;
    points_awarded: number;
    star_rating: number;
    solved_at: string | null;
    created_at: string;
    updated_at?: string;
  };
};

export async function getQuestionSessionEvidence(
  sessionId: string,
): Promise<QuestionSessionEvidenceResponse> {
  return apiFetch<QuestionSessionEvidenceResponse>(`/api/student-question/${sessionId}/evidence/`);
}

/**
 * The evidence behind one English Writing session card: the chat as it happened,
 * and every mistake Maya flagged in it. `original` is the phrase the student
 * wrote and `corrected` is what to say instead, so the pair is the correction.
 */
export type EnglishSessionEvidenceResponse = {
  student: { id: string; full_name: string };
  module: ActivityModuleKey;
  module_label: string;
  session: {
    id: string;
    title: string;
    status: string;
    finalized_at: string | null;
    created_at: string;
    updated_at?: string;
    /** Every dimension is null until the session was finalised and analysed. */
    scores: Record<string, number | null>;
    mistakes: {
      turn_index: number;
      category: string;
      original: string;
      corrected: string;
      explanation: string;
    }[];
    transcript: QuestionSessionTurn[];
    strengths: string;
    areas_for_improvement: string;
    recurring_mistakes: string;
    ai_recommendations: string;
  };
};

export async function getEnglishSessionEvidence(
  sessionId: string,
): Promise<EnglishSessionEvidenceResponse> {
  return apiFetch<EnglishSessionEvidenceResponse>(`/api/student-english/${sessionId}/evidence/`);
}

export type LeaderboardStudent = StudentRecord & { is_self: boolean };

export type LeaderboardResponse = {
  institution: string;
  total: number;
  ranked: number;
  students: LeaderboardStudent[];
};

export async function getReadinessLeaderboard(): Promise<LeaderboardResponse> {
  return apiFetch<LeaderboardResponse>("/api/readiness/leaderboard/");
}

export type StudentMessage = {
  id: string;
  content: string;
  created_at: string;
  from_user_id: number;
  to_user_id: number;
  from_name: string;
  is_mine: boolean;
};

export type StudentMessagePeer = {
  id: string;
  full_name: string;
  department: string;
  program: string;
  start_year: number | null;
  end_year: number | null;
};

export type StudentMessagesResponse = {
  // candidate_id of the signed-in viewer — the screen is always backed by it.
  viewer_candidate_id: string | null;
  // candidate_id of the peer being viewed; equals viewer_candidate_id on self.
  student_id: string;
  is_self: boolean;
  peer: StudentMessagePeer;
  messages: StudentMessage[];
};

export async function studentMessages(studentId: string): Promise<StudentMessagesResponse> {
  return apiFetch<StudentMessagesResponse>(`/api/students/${studentId}/messages/`);
}

export async function sendStudentMessage(
  studentId: string,
  content: string,
): Promise<StudentMessage> {
  const data = await apiFetch<{ message: StudentMessage }>(`/api/students/${studentId}/messages/`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
  return data.message;
}

export type DriveStatus = "Live" | "Upcoming" | "Completed" | "Cancelled";

// One hiring event. Everything here is per-drive: a company that runs two
// drives has its own dates, rounds, role and status on each.
export type PlacementDrive = {
  drive_id: number;
  company_id: string;
  company_name: string;
  // Read off the drive's company, so every drive a company runs shows the same
  // icon. Empty when no website was recorded or the favicon did not resolve.
  company_logo: string;
  website: string;
  title: string;
  industry: string;
  // One role per drive. Empty string when the drive has not named one yet.
  role: string;
  ctc_min: number | null;
  ctc_max: number | null;
  tier: DriveCompanyTier;
  mode: string;
  location: string;
  application_deadline: string | null;
  campus_visit_date: string | null;
  status: DriveStatus;
  /**
   * The status key as stored on the row (`upcoming` / `ongoing` / ...), which is
   * not always what `status` says: a drive whose campus visit is today is
   * reported as `Live` while the row may still read `upcoming`. Only the edit
   * form reads this, to prefill from what is actually saved.
   */
  stored_status?: string;
  openings: number | null;
  eligible_courses: string[];
  eligible_branches: string[];
  minimum_cgpa: number | null;
  maximum_backlogs: number | null;
  required_skills: string[];
  preferred_skills: string[];
  selection_rounds: string[];
  placement_mode: string;
  offer_status: string;
  eligible_count: number;
  /** Drive type (campus / virtual / off_campus); only the edit form reads it. */
  drive_mode: string;
  /** Batch year eligible for this drive, as stored on the row. */
  graduation_year: number | null;
  /** Stored vacancy count, before the `openings` fallback to zero. */
  total_vacancies: number | null;
};

export type DrivesData = {
  drives: PlacementDrive[];
  // How many drive records back the listing.
  count: number;
  drive_count: number;
};

export async function getDrives(): Promise<DrivesData> {
  return apiFetch<DrivesData>("/api/drives/");
}

// What a student sees on the Company/Drives screen. A drive is the same hiring
// detail the placement cell sees, minus `eligible_count` - that count describes
// the cell's queue rather than the student's own standing, so it never leaves
// the staff endpoints.
export type StudentDrive = Omit<PlacementDrive, "eligible_count">;

export type StudentCompanyDrives = {
  companies: PlacementCompany[];
  drives: StudentDrive[];
  count: number;
  drive_count: number;
};

// Everything the candidate's college is registered with, plus its scheduled
// drives. Scoped to the candidate's institution server-side; a candidate with no
// college gets empty lists rather than an error.
export async function getCandidateCompanyDrives(): Promise<StudentCompanyDrives> {
  return apiFetch<StudentCompanyDrives>("/api/candidate/company-drives/");
}

export type CandidateCompanyDetail = {
  company: PlacementCompany;
  drives: StudentDrive[];
};

// One recruiter plus the drives it has run. The backend starts writing a
// Gemini profile for the company if it does not have one yet, so the first
// response can come back with an empty company_ai_info; reloading a few seconds
// later shows the block.
export async function getCandidateCompany(id: number): Promise<CandidateCompanyDetail> {
  return apiFetch<CandidateCompanyDetail>(`/api/candidate/company-drives/${id}/`);
}

// A drive is one hiring event. `company` is the pk of an already-registered
// company; every other key is the per-visit detail that used to sit on Company.
// Blank numeric/date fields must be null or omitted, never "". Leaving a
// numeric blank falls back to the company's standing value server-side.
export type DriveCreatePayload = {
  company: number;
  title: string;
  role?: string;
  total_vacancies?: number | null;
  drive_mode?: "campus" | "virtual" | "off_campus";
  status?: "upcoming" | "ongoing" | "completed" | "cancelled";
  visit_date?: string | null;
  application_deadline?: string | null;
  work_mode?: "remote" | "hybrid" | "onsite" | "field";
  work_location?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  eligible_branches?: string[];
  eligible_courses?: string[];
  minimum_cgpa?: number | null;
  maximum_backlogs?: number | null;
  graduation_year?: number | null;
  required_skills?: string[];
  preferred_skills?: string[];
  selection_rounds?: string[];
  placement_mode?: "full_time" | "internship_ppo" | "contract";
  offer_status?: "pending" | "offered" | "on_hold" | "revoked";
};

export async function createDrive(payload: DriveCreatePayload): Promise<PlacementDrive> {
  const data = await apiFetch<{ drive: PlacementDrive }>("/api/drives/create/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.drive;
}

// The body of an edit. Same fields as the create payload minus `company`: a
// drive's company is its identity, so amending the terms of a visit never moves
// it to a different recruiter. Every key is optional and only the ones sent are
// written, so a partial edit leaves the rest of the drive alone.
export type DriveEditPayload = Omit<Partial<DriveCreatePayload>, "company">;

// Amend a drive already on record: deadline slips, openings revised, status
// advancing, offers made or revoked. The company is not editable here.
export async function updateDrive(
  driveId: number,
  payload: DriveEditPayload,
): Promise<PlacementDrive> {
  const data = await apiFetch<{ drive: PlacementDrive }>(`/api/drives/${driveId}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return data.drive;
}

export type TotalVacancies = {
  total_vacancies: number;
  drive_count: number;
  institution: string | null;
};

// Total vacancies across every drive of the signed-in staff's college.
// Pass a status ("upcoming" | "ongoing" | "completed" | "cancelled") to
// narrow it to that one status.
export async function getTotalVacancies(status?: string): Promise<TotalVacancies> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<TotalVacancies>(`/api/drives/total-vacancies/${query}`);
}

export type ReportsData = {
  kpis: {
    students: number;
    eligible: number;
    placed: number;
    rate: number;
    avg_expected_ctc: number | null;
    recruiters: number;
    openings: number;
  };
  monthly: MonthlyPoint[];
  depts: DepartmentStat[];
  industries: { industry: string; count: number }[];
  ctc_bands: { band: string; companies: number }[];
  tiers: { tier: DriveCompanyTier; label: string; count: number }[];
  batch: { year: number; students: number };
};

export async function getReportsData(): Promise<ReportsData> {
  return apiFetch<ReportsData>("/api/reports/");
}

// ── Coursera courses (candidate /courses screen) ─────────────────────────────
// Scraped server-side from Coursera's public search page. The backend answers
// with the default "data science" search when `query` is omitted.

export type CourseraCourse = {
  id: string;
  title: string;
  description: string;
  image: string;
  course_url: string;
  tagline: string;
  partners: string[];
  partner_logos: string[];
  rating: number | null;
  rating_count: number | null;
  review_count: number | null;
  level: string;
  level_label: string;
  duration: string;
  duration_label: string;
  product_type: string;
  type_label: string;
  skills: string[];
  tools: string[];
  languages: string[];
  subtitle_languages: string[];
  is_free: boolean;
  is_credit_eligible: boolean;
  is_new: boolean;
  in_coursera_plus: boolean;
  badges: string[];
};

export type CourseraFacetValue = {
  value: string;
  count: number | null;
};

export type CourseraCoursesResponse = {
  query: string;
  count: number;
  total_results: number | null;
  total_pages: number | null;
  source: string;
  fetched_at: string;
  cached: boolean;
  courses: CourseraCourse[];
  facets: Record<string, CourseraFacetValue[]>;
};

export async function getCourses(query?: string): Promise<CourseraCoursesResponse> {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  // A cold request scrapes Coursera live, so allow more than the default budget.
  return apiFetch<CourseraCoursesResponse>(`/api/courses/${suffix}`, {
    timeoutMs: LONG_TIMEOUT_MS,
  });
}

/**
 * One tracked weakness area, e.g. "Communication & Soft Skills".
 *
 * `query` is the Coursera search phrase that addresses it, so the courses grid can
 * be driven straight from the segment the candidate picks. The buckets mirror the
 * ones the /tutorials screen uses, so the same label means the same thing on both.
 */
export type CourseWeaknessSegment = {
  key: string;
  label: string;
  query: string;
  blurb: string;
  /** Weakest recent score found, 0-100. Lower means a more urgent gap. */
  score: number;
  /** How many individual scores were averaged into `score`. */
  sample_size: number;
  /** Which training areas the evidence came from. */
  sources: string[];
  /** Short, human-readable reasons, strongest first. */
  evidence: string[];
};

export type CourseWeaknessSegmentsResponse = {
  /** Weakest first. Empty when the candidate has no tracked training data yet. */
  segments: CourseWeaknessSegment[];
  count: number;
};

export async function courseSegments(): Promise<CourseWeaknessSegmentsResponse> {
  return apiFetch<CourseWeaknessSegmentsResponse>("/api/courses/segments/");
}
