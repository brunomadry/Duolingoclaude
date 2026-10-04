import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { UnlockRequestSchema } from '../../src/shared/api.ts';
import { COOKIE_MAX_AGE_SECONDS, COOKIE_NAME, codeMatches, signAccessToken } from '../auth.ts';
import { clientIp, fail, readJson, type AppEnv } from '../http.ts';
import { LIMITS, hit } from '../rate-limit.ts';

export const session = new Hono<AppEnv>();

session.post('/unlock', async (c) => {
  const now = Date.now();
  const ip = clientIp(c);
  const [perIp, global] = await Promise.all([
    hit(c.env.DB, `unlock:ip:${ip}`, LIMITS.unlockPerIp, now),
    hit(c.env.DB, 'unlock:global', LIMITS.unlockGlobal, now),
  ]);
  if (!perIp.allowed || !global.allowed) {
    const retryAfter = Math.ceil(Math.max(perIp.retryAfterMs, global.retryAfterMs) / 1000);
    fail('rate_limited', 'too many attempts', { 'retry-after': String(retryAfter) });
  }

  const { code } = await readJson(c, UnlockRequestSchema);
  if (!c.env.APP_ACCESS_CODE || !c.env.COOKIE_SECRET) fail('server_error', 'server not configured');
  const ok = await codeMatches(code.trim(), c.env.APP_ACCESS_CODE, c.env.COOKIE_SECRET);
  if (!ok) fail('locked', 'wrong code');

  setCookie(
    c,
    COOKIE_NAME,
    await signAccessToken(c.env.APP_ACCESS_CODE, c.env.COOKIE_SECRET, now),
    {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === 'https:',
      sameSite: 'Strict',
      path: '/',
      maxAge: COOKIE_MAX_AGE_SECONDS,
    },
  );
  return c.json({ ok: true });
});

/** Cheap check used by the client on launch. Requires the cookie (see index.ts). */
session.get('/session', (c) => c.json({ ok: true }));

session.post('/lock', (c) => {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
  return c.json({ ok: true });
});
