import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { APP_NAME } from '../src/shared/constants.ts';
import { COOKIE_NAME, verifyAccessToken } from './auth.ts';
import type { Env } from './env.ts';
import { fail, type AppEnv } from './http.ts';
import { ai } from './routes/ai.ts';
import { hardDeleteExpired, profiles } from './routes/profiles.ts';
import { reports } from './routes/reports.ts';
import { session } from './routes/session.ts';

const OPEN_PATHS = new Set(['/api/unlock', '/api/health']);

export const app = new Hono<AppEnv>().basePath('/api');

app.use('*', async (c, next) => {
  await next();
  c.header('cache-control', 'no-store');
  c.header('x-content-type-options', 'nosniff');
});

app.use(
  '*',
  bodyLimit({ maxSize: 512 * 1024, onError: () => fail('too_large', 'request body too large') }),
);

// Everything except unlock and health needs a valid access cookie.
app.use('*', async (c, next) => {
  if (OPEN_PATHS.has(c.req.path)) return next();
  const ok = await verifyAccessToken(
    getCookie(c, COOKIE_NAME),
    c.env.APP_ACCESS_CODE,
    c.env.COOKIE_SECRET,
    Date.now(),
  );
  if (!ok) fail('locked');
  // Mutations must be JSON: blocks simple cross-site form posts on top of SameSite=Strict.
  if (c.req.method !== 'GET' && c.req.method !== 'DELETE') {
    if (!c.req.header('content-type')?.startsWith('application/json')) {
      fail('bad_request', 'expected application/json');
    }
  }
  return next();
});

app.get('/health', (c) => c.json({ ok: true, app: APP_NAME }));
app.route('/', session);
app.route('/profiles', profiles);
app.route('/reports', reports);
app.route('/ai', ai);

app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.json({ error: 'server_error' }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(hardDeleteExpired(env.DB, Date.now()));
  },
} satisfies ExportedHandler<Env>;
