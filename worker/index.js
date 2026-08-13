// worker/index.js — single Worker entry point.
//
// Cloudflare's current git-integration ("Workers Builds") deploys this
// project as a genuine Worker, not the older, separate "Pages" product —
// even when created via a "Pages" option in the dashboard. That's why the
// auto-injected build credentials could run `wrangler deploy` fine but
// rejected `wrangler pages deploy` with an auth error: that command targets
// a different (Pages Projects) API that this project was never provisioned
// under. So routing that would have been file-based under /functions in
// classic Pages is handled explicitly here instead, in one script.
//
// Two jobs: (1) handle the four OAuth endpoints, exactly as before, and (2)
// serve the static app (everything in /public — see wrangler.toml) for
// every other request, via the ASSETS binding.
function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const CLEAR_STATE_COOKIE = 'fd_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
const CLEAR_SESSION_COOKIE = 'fd_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
// 400 days in seconds — the longest Max-Age Chrome will honor for a cookie.
const SESSION_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

function json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
  });
}

// GET /api/auth/login — starts the Google OAuth "authorization code" flow.
// access_type=offline + prompt=consent together guarantee Google hands back
// a refresh_token every time — Google only does that automatically the very
// first time an account authorizes this app.
async function handleLogin(request, env) {
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/auth/callback`;
  const state = crypto.randomUUID();

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  // drive.appdata (this app's own hidden folder only) plus openid/email are
  // all non-sensitive scopes — publishing the OAuth consent screen to
  // production needs no Google verification review. See DEPLOY.md.
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.appdata openid email');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  const headers = new Headers({ Location: authUrl.toString() });
  headers.append(
    'Set-Cookie',
    `fd_oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`
  );
  return new Response(null, { status: 302, headers });
}

// GET /api/auth/callback — Google redirects here after consent. Exchanges
// the one-time code for tokens and stores the refresh token in KV, keyed by
// a random session id set as an HttpOnly cookie.
async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = getCookie(request, 'fd_oauth_state');

  function fail() {
    const headers = new Headers({ Location: `${url.origin}/?gdrive=error` });
    headers.append('Set-Cookie', CLEAR_STATE_COOKIE);
    return new Response(null, { status: 302, headers });
  }

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
  if (!tokens.refresh_token) {
    // Shouldn't happen with access_type=offline + prompt=consent, but if it
    // does there's nothing durable to store.
    return fail();
  }

  const sessionId = crypto.randomUUID();
  await env.FLASHDRILL_SESSIONS.put(
    `session:${sessionId}`,
    JSON.stringify({ refresh_token: tokens.refresh_token, created_at: Date.now() })
  );

  const headers = new Headers({ Location: `${url.origin}/?gdrive=connected` });
  headers.append('Set-Cookie', CLEAR_STATE_COOKIE);
  headers.append(
    'Set-Cookie',
    `fd_session=${sessionId}; Path=/; Max-Age=${SESSION_COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`
  );
  return new Response(null, { status: 302, headers });
}

// GET /api/auth/token — mints a fresh Drive access token from the refresh
// token stored in KV. This is what the app calls instead of ever talking to
// Google directly — the piece that makes "stay signed in" survive any
// length of browser closure.
async function handleToken(request, env) {
  const sessionId = getCookie(request, 'fd_session');
  if (!sessionId) {
    return json({ error: 'no-session' }, 401);
  }

  const raw = await env.FLASHDRILL_SESSIONS.get(`session:${sessionId}`);
  if (!raw) {
    return json({ error: 'no-session' }, 401, { 'Set-Cookie': CLEAR_SESSION_COOKIE });
  }

  const session = JSON.parse(raw);
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: session.refresh_token,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenRes.ok) {
    // Refresh token itself is dead (revoked, unused 6+ months, or — if the
    // OAuth consent screen is still in "Testing" status — simply 7 days
    // old). Clean up so the app falls back to "Continue with Google".
    await env.FLASHDRILL_SESSIONS.delete(`session:${sessionId}`);
    return json({ error: 'reauth-required' }, 401, { 'Set-Cookie': CLEAR_SESSION_COOKIE });
  }

  const tokens = await tokenRes.json();
  return json({ access_token: tokens.access_token, expires_in: tokens.expires_in }, 200);
}

// POST /api/auth/logout — revokes the refresh token with Google and deletes
// the KV session.
async function handleLogout(request, env) {
  const sessionId = getCookie(request, 'fd_session');
  if (sessionId) {
    const raw = await env.FLASHDRILL_SESSIONS.get(`session:${sessionId}`);
    if (raw) {
      const session = JSON.parse(raw);
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: session.refresh_token }),
        });
      } catch (e) {
        // Best-effort — the KV cleanup below still runs regardless.
      }
    }
    await env.FLASHDRILL_SESSIONS.delete(`session:${sessionId}`);
  }
  return json({ ok: true }, 200, { 'Set-Cookie': CLEAR_SESSION_COOKIE });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const { method } = request;

    if (pathname === '/api/auth/login' && method === 'GET') return handleLogin(request, env);
    if (pathname === '/api/auth/callback' && method === 'GET') return handleCallback(request, env);
    if (pathname === '/api/auth/token' && method === 'GET') return handleToken(request, env);
    if (pathname === '/api/auth/logout' && method === 'POST') return handleLogout(request, env);

    // Everything else: serve the static app from /public (see wrangler.toml).
    return env.ASSETS.fetch(request);
  },
};
