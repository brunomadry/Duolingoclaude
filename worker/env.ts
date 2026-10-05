/** Bindings and secrets available to the Worker (see wrangler.jsonc and SETUP.md). */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Shared access code, set with `wrangler secret put APP_ACCESS_CODE`. */
  APP_ACCESS_CODE: string;
  /** HMAC key for the access cookie, set with `wrangler secret put COOKIE_SECRET`. */
  COOKIE_SECRET: string;
  /** Optional AI keys (free tiers), set with `wrangler secret put`. Without both, AI is off. */
  GROQ_API_KEY?: string;
  GEMINI_API_KEY?: string;
  /** Optional model overrides (plain vars in wrangler.jsonc). */
  GROQ_MODEL?: string;
  GEMINI_MODEL?: string;
}
