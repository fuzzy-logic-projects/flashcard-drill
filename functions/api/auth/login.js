// GET /api/auth/login — starts the Google OAuth "authorization code" flow.
//
// This is a full top-level redirect, not a popup: the browser leaves the app,
// Google shows its consent screen, then Google redirects to
// /api/auth/callback (below), which sends the browser back here.
//
// access_type=offline + prompt=consent together guarantee Google hands back a
// refresh_token every time this runs. Google only does that automatically the
// very first time an account ever authorizes this app — a repeat sign-in
// (e.g. after using the in-app "Sign out") would otherwise silently get an
// access token with NO refresh token, which would defeat the entire point of
// this backend.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/auth/callback`;

  // Random per-attempt value, checked against the cookie below when Google
  // redirects back — standard CSRF protection for the OAuth redirect.
  const state = crypto.randomUUID();

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  // drive.appdata is a non-sensitive Drive scope (Google's own classification —
  // it only grants access to this app's own hidden per-app folder, nothing else
  // in the user's Drive). openid/email are also non-sensitive and let the app
  // show which account is connected. None of this requires Google's app
  // verification review, even once the OAuth consent screen is published to
  // "In production" — see DEPLOY.md.
  authUrl.searchParams.set(
    'scope',
    'https://www.googleapis.com/auth/drive.appdata openid email'
  );
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  const headers = new Headers({ Location: authUrl.toString() });
  // Short-lived, HttpOnly — only used to verify `state` on the way back.
  headers.append(
    'Set-Cookie',
    `fd_oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`
  );

  return new Response(null, { status: 302, headers });
}
