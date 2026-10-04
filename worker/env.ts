/** Bindings and secrets available to the Worker (see wrangler.jsonc and SETUP.md). */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Shared access code, set with `wrangler secret put APP_ACCESS_CODE`. */
  APP_ACCESS_CODE: string;
  /** HMAC key for the access cookie, set with `wrangler secret put COOKIE_SECRET`. */
  COOKIE_SECRET: string;
  GROQ_API_KEY?: string;
  GEMINI_API_KEY?: string;
}
