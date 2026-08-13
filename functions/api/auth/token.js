// GET /api/auth/token — returns a fresh Google Drive access token for the
// signed-in session, minted on the spot from the refresh token stored in KV.
//
// This is the endpoint the app calls instead of ever talking to Google
// directly for auth. It's what makes "stay signed in" actually mean any
// length of time, not just under an hour: a refresh token isn't a browser
// session, so there's nothing here for a browser/tab closure to invalidate.
function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const CLEAR_SESSION_COOKIE = 'fd_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';

function json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
  });
}

export async function onRequestGet({ request, env }) {
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
    // The refresh token itself is dead — revoked from the Google Account's
    // "Connected apps" page, unused for 6+ months, or (if this project is
    // still in "Testing" publishing status in Google Cloud Console) simply 7
    // days old. Clean up so the app falls back to "Continue with Google"
    // instead of quietly failing forever. See DEPLOY.md.
    await env.FLASHDRILL_SESSIONS.delete(`session:${sessionId}`);
    return json({ error: 'reauth-required' }, 401, { 'Set-Cookie': CLEAR_SESSION_COOKIE });
  }

  const tokens = await tokenRes.json();
  return json({ access_token: tokens.access_token, expires_in: tokens.expires_in }, 200);
}
