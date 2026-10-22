import { cookies } from "next/headers";

import { API_PREFIX } from "@chlat/contracts/prefix";

/**
 * The session helper.
 *
 * The access token is delivered as an **HttpOnly** cookie by the API
 * (`POST /auth/login` sets it), so it is never readable from JavaScript and
 * never has to be put in `localStorage`. A page that needs the actor reads it
 * on the server and passes it to the API in the `Authorization` header.
 *
 * The refresh token is scoped to the auth routes so it is not attached to
 * every API call — see `specs/features/authentication/design.md`.
 */

/** The name of the access-token cookie. */
export const ACCESS_TOKEN_COOKIE = "chlat_at";

/** The name of the refresh-token cookie. */
export const REFRESH_TOKEN_COOKIE = "chlat_rt";

/** The actor, as the web app understands it. */
export interface SessionActor {
  userId: string;
  email: string | null;
  displayName: string | null;
  role: "super_admin" | "owner" | "guard" | "user";
  scopeKind: "platform" | "owned" | "assigned" | "self";
}

/** The session, as the web app understands it. */
export interface Session {
  /** The actor, or `null` when nobody is signed in. */
  actor: SessionActor | null;
  /** The access token, for server-to-server calls. */
  accessToken: string | null;
}

/**
 * Read the access token from the request cookies.
 *
 * Returns `null` when there is no session — a signed-out visitor is a
 * normal state, not an error.
 */
export async function getAccessToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
}

/**
 * Read the current session.
 *
 * The actor is *not* decoded from the token: the token is opaque to the web
 * app, and the actor context comes from `GET /auth/me`. This helper returns
 * the token only; use {@link loadSession} for the actor.
 */
export async function loadSession(): Promise<Session> {
  const accessToken = await getAccessToken();
  return { actor: null, accessToken };
}

/**
 * Read the actor context from the API.
 *
 * Returns `null` when nobody is signed in or when the token has expired —
 * both mean "there is no actor", and neither is worth an error page.
 */
export async function loadActor(fetchImpl: typeof fetch = fetch): Promise<SessionActor | null> {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return null;
  }

  const response = await fetchImpl(
    `${process.env["API_INTERNAL_URL"] ?? "http://localhost:3001"}${API_PREFIX}/auth/me`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { data?: SessionActor } | SessionActor;
  const data = "data" in payload && payload.data ? payload.data : (payload as SessionActor);

  return data ?? null;
}

/**
 * A server action stub for signing out.
 *
 * It is a stub on purpose: the auth module is the backend developer's
 * surface. The shape is fixed here so the frontend can call it without
 * waiting, and so the cookie name and the endpoint do not drift.
 */
export async function signOutAction(): Promise<{ ok: boolean }> {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return { ok: true };
  }

  try {
    await fetch(
      `${process.env["API_INTERNAL_URL"] ?? "http://localhost:3001"}${API_PREFIX}/auth/logout`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      },
    );
  } catch {
    // A failed sign-out must not trap the user in a signed-in state that the
    // server has already forgotten. The cookie is cleared by the redirect
    // that follows.
  }

  return { ok: true };
}
