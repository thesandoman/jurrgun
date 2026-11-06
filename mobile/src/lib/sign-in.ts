/**
 * Google and LINE sign-in for the app (RFC 8252, built with Core Platform;
 * final flow after QA & Release's security review).
 *
 * Google refuses sign-in inside an embedded web view, so the app runs it in
 * the phone's own browser and brings back a one-time code. Both ends of the
 * exchange run inside the web view, as same-origin fetches on a page of the
 * site, so the session cookie lands there and nowhere else:
 *   0. begin: the web view POSTs the PKCE challenge to /auth/app/begin, which
 *      sets a 10-minute cookie tying this sign-in to this web view.
 *   1. The phone's browser opens /auth/{google|line}?app=1 with the same
 *      challenge and returns to jurrgun://auth?code=… (once, 2 minutes).
 *   2. finish: the web view POSTs the code and the verifier to
 *      /auth/app/finish, which sets the site's normal HttpOnly cookie and
 *      says where to go next.
 * The verifier lives only in memory, never in a URL; the app never holds a
 * session token.
 */
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

export type Provider = 'google' | 'line' | 'apple';
export type Pkce = { verifier: string; challenge: string };
export type BrowserResult = { ok: true; code: string } | { ok: false; reason: 'cancelled' | 'failed' | 'busy' };

/** The message the begin script posts back to the app. */
export const BEGIN_MESSAGE = 'jurrgun-signin-begin';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
const base64url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function makePkce(): Promise<Pkce> {
  let verifier = '';
  for (const b of Crypto.getRandomBytes(64)) verifier += CHARS[b % CHARS.length];
  const challenge = base64url(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 }));
  return { verifier, challenge };
}

/** /auth/google, /auth/line or /auth/apple on the site, as the site's own buttons link them. */
export function providerFrom(site: string, url: string): Provider | null {
  try {
    const u = new URL(url);
    if (u.origin !== site || u.searchParams.has('app')) return null;
    const m = u.pathname.match(/^\/auth\/(google|line|apple)\/?$/);
    return m ? (m[1] as Provider) : null;
  } catch {
    return null;
  }
}

/** Step 0, run in the web view: answers through postMessage with this attempt's id. */
export function beginScript(challenge: string, id: string): string {
  const reply = (ok: string) => `window.ReactNativeWebView.postMessage(JSON.stringify({type:${JSON.stringify(BEGIN_MESSAGE)},id:${JSON.stringify(id)},ok:${ok}}))`;
  return (
    `fetch("/auth/app/begin",{method:"POST",credentials:"same-origin",headers:{"x-jurrgun-app":"begin"},body:new URLSearchParams({code_challenge:${JSON.stringify(challenge)}})})` +
    `.then(function(r){${reply('r.ok')}}).catch(function(){${reply('false')}});true;`
  );
}

/** Step 1, in the phone's browser. */
export async function openSignIn(site: string, provider: Provider, challenge: string): Promise<BrowserResult> {
  const redirect = 'jurrgun://auth';
  const start = `${site}/auth/${provider}?app=1&redirect_uri=${encodeURIComponent(redirect)}&code_challenge=${challenge}&code_challenge_method=S256`;
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
  if (!code || !/^[A-Za-z0-9._~-]{8,256}$/.test(code)) {
    return { ok: false, reason: err === 'busy' ? 'busy' : err === 'cancelled' ? 'cancelled' : 'failed' };
  }
  return { ok: true, code };
}

/** Step 2, run in the web view: swaps the code for the cookie, then goes on. */
export function finishScript(code: string, verifier: string): string {
  return (
    `fetch("/auth/app/finish",{method:"POST",credentials:"same-origin",headers:{"x-jurrgun-app":"finish"},body:new URLSearchParams({code:${JSON.stringify(code)},code_verifier:${JSON.stringify(verifier)}})})` +
    `.then(function(r){return r.ok?r.json():Promise.reject(r.status)})` +
    `.then(function(j){location.href=typeof j.next==="string"&&j.next.charAt(0)==="/"&&j.next.charAt(1)!=="/"?j.next:"/"})` +
    `.catch(function(){location.href="/login"});true;`
  );
}
