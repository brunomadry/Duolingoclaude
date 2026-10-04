/**
 * Shared access code and the signed access cookie.
 *
 * Cookie value: `v1.<issuedAtSeconds>.<base64url HMAC-SHA256>` where the MAC covers
 * the version, the issue time and a fingerprint of the current access code. So:
 * - rotating COOKIE_SECRET signs every device out,
 * - rotating APP_ACCESS_CODE also signs every device out (a leaked code stops working
 *   everywhere at once).
 */

export const COOKIE_NAME = 'aka_access';
/** Browsers cap cookie lifetime at 400 days; that is our "long lived". */
export const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

const encoder = new TextEncoder();

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

async function sha256Hex(message: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(message)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two equal-length byte arrays (false if lengths differ). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/**
 * Compares the submitted code with the real one without leaking length or prefix
 * timing: both sides are first reduced to fixed-length HMACs.
 */
export async function codeMatches(
  submitted: string,
  actual: string,
  secret: string,
): Promise<boolean> {
  if (!actual) return false;
  const [a, b] = await Promise.all([
    hmac(secret, `code:${submitted}`),
    hmac(secret, `code:${actual}`),
  ]);
  return timingSafeEqual(a, b);
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function payload(issuedAt: number, accessCode: string): Promise<string> {
  const fingerprint = (await sha256Hex(`aka:${accessCode}`)).slice(0, 16);
  return `v1.${issuedAt}.${fingerprint}`;
}

export async function signAccessToken(
  accessCode: string,
  secret: string,
  nowMs: number,
): Promise<string> {
  const issuedAt = Math.floor(nowMs / 1000);
  const mac = await hmac(secret, await payload(issuedAt, accessCode));
  return `v1.${issuedAt}.${toBase64Url(mac)}`;
}

export async function verifyAccessToken(
  token: string | undefined,
  accessCode: string,
  secret: string,
  nowMs: number,
): Promise<boolean> {
  if (!token || !accessCode || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const issuedAt = Number(parts[1]);
  if (!Number.isInteger(issuedAt)) return false;
  const ageSeconds = nowMs / 1000 - issuedAt;
  // Allow a minute of clock skew into the future; reject anything older than the cookie life.
  if (ageSeconds < -60 || ageSeconds > COOKIE_MAX_AGE_SECONDS) return false;
  const given = fromBase64Url(parts[2] ?? '');
  if (!given) return false;
  const expected = await hmac(secret, await payload(issuedAt, accessCode));
  return timingSafeEqual(given, expected);
}
