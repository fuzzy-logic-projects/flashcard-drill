// GET /api/auth/callback — Google redirects here after the user grants (or
// denies) consent. Exchanges the one-time authorization code for tokens
// (requires the client secret, which is why this step has to happen
// server-side and never in the browser), stores the refresh token in KV
// keyed by a random session id, sets that id as an HttpOnly session cookie,
// and sends the browser back to the app.
function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const CLEAR_STATE_COOKIE = 'fd_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';

// 400 days in seconds — the longest Max-Age Chrome will honor for a cookie.
// The session itself doesn't actually expire on this schedule (Google's
// refresh token is the thing with a lifetime — see token.js); this just
// keeps the browser from dropping the cookie on its own long before that.
const SESSION_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = getCookie(request, 'fd_oauth_state');

  function fail() {
    const headers = new Headers({ Location: `${url.origin}/?gdrive=error` });
    headers.append('Set-Cookie', CLEAR_STATE_COOKIE);
    return new Response(null, { status: 302, headers });
  }

  // Covers both a CSRF mismatch and the user clicking "Cancel" on Google's
  // consent screen (Google redirects back with an `error` param and no code).
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail();
  }

  const redirectUri = `${url.origin}/api/auth/callback`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return fail();
  }

  const tokens = await tokenRes.json();

  // Shouldn't happen with access_type=offline + prompt=consent (see login.js),
  // but if Google ever omits it there's nothing durable to store — bail out
  // rather than create a session that can never refresh itself.
  if (!tokens.refresh_token) {
    return fail();
  }

  const sessionId = crypto.randomUUID();
  await env.FLASHDRILL_SESSIONS.put(
    `session:${sessionId}`,
    JSON.stringify({
      refresh_token: tokens.refresh_token,
      created_at: Date.now(),
    })
  );

  const headers = new Headers({ Location: `${url.origin}/?gdrive=connected` });
  headers.append('Set-Cookie', CLEAR_STATE_COOKIE);
  headers.append(
    'Set-Cookie',
    `fd_session=${sessionId}; Path=/; Max-Age=${SESSION_COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`
  );
  return new Response(null, { status: 302, headers });
}
