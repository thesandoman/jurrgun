/**
 * Google and LINE sign-in for the app (RFC 8252, built with Core Platform).
 *
 * Google refuses sign-in inside an embedded web view, so the app runs it in
 * the phone's own browser and comes back with a one-time code:
 *   1. A PKCE verifier is made here and kept in memory only.
 *   2. The browser opens /auth/{google|line}?app=1 with the verifier's
 *      SHA-256 challenge and returns to jurrgun://auth?code=… (2 minutes,
 *      once, only with that verifier).
 *   3. The web view itself POSTs the code and verifier to /auth/app/finish,
 *      which sets the site's normal HttpOnly cookie in the web view. The app
 *      never holds a session token, and the verifier never goes in a URL.
 */
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

export type Provider = 'google' | 'line';
export type SignInStart = { method: 'POST'; uri: string; headers: Record<string, string>; body: string };
export type SignInResult = { ok: true; source: SignInStart } | { ok: false; reason: 'cancelled' | 'failed' | 'busy' };

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/** 64 characters from the PKCE alphabet. */
function verifier(): string {
  const bytes = Crypto.getRandomBytes(64);
  let out = '';
  for (const b of bytes) out += CHARS[b % CHARS.length];
  return out;
}

const base64url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** /auth/google or /auth/line on the site, as the site's own buttons link them. */
export function providerFrom(site: string, url: string): Provider | null {
  try {
    const u = new URL(url);
    if (u.origin !== site || u.searchParams.has('app')) return null;
    const m = u.pathname.match(/^\/auth\/(google|line)\/?$/);
    return m ? (m[1] as Provider) : null;
  } catch {
    return null;
  }
}

export async function signIn(site: string, provider: Provider): Promise<SignInResult> {
  const v = verifier();
  const challenge = base64url(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, v, { encoding: Crypto.CryptoEncoding.BASE64 }));
  // jurrgun://auth in an installed build; Expo Go gives its own exp://…/--/auth.
  const redirect = Linking.createURL('auth');
  const start =
    `${site}/auth/${provider}?app=1&redirect_uri=${encodeURIComponent(redirect)}` +
    `&code_challenge=${challenge}&code_challenge_method=S256`;
  let res: WebBrowser.WebBrowserAuthSessionResult;
  try {
    res = await WebBrowser.openAuthSessionAsync(start, redirect);
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if (res.type !== 'success') return { ok: false, reason: 'cancelled' };
  const { queryParams } = Linking.parse(res.url);
  const code = typeof queryParams?.code === 'string' ? queryParams.code : '';
  const err = queryParams?.error;
  if (!code) return { ok: false, reason: err === 'busy' ? 'busy' : err === 'cancelled' ? 'cancelled' : 'failed' };
  return {
    ok: true,
    source: {
      method: 'POST',
      uri: `${site}/auth/app/finish`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `code=${encodeURIComponent(code)}&code_verifier=${encodeURIComponent(v)}`,
    },
  };
}
