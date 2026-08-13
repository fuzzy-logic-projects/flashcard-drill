// POST /api/auth/logout — revokes the stored refresh token with Google
// (which also invalidates any access token minted from it), deletes the KV
// session, and clears the session cookie. Called by the app's "Sign out".
function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const CLEAR_SESSION_COOKIE = 'fd_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';

export async function onRequestPost({ request, env }) {
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
        // Best-effort — the KV cleanup below still runs regardless. Worst
        // case, an unrevoked grant is still visible (and removable) on the
        // Google Account's own "Connected apps" page.
      }
    }
    await env.FLASHDRILL_SESSIONS.delete(`session:${sessionId}`);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': CLEAR_SESSION_COOKIE,
    },
  });
}
