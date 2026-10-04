import { Hono } from 'hono';
import { APP_NAME } from '../src/shared/constants.ts';
import type { Env } from './env.ts';

const app = new Hono<{ Bindings: Env }>().basePath('/api');

app.get('/health', (c) => c.json({ ok: true, app: APP_NAME }));

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
