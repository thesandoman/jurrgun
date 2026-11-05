/**
 * Jurrgun app, v1: an Expo shell around the live site (owner, 2026-11-05:
 * "Expo shell first").
 *
 * The site does the work; the shell adds what a website can't do well on a
 * phone: Android's back button, a native offline screen, phone links
 * (tel:, LINE, maps) handed to the right app, outside links in the system
 * browser, and jurrgun:// links that open a page in the app.
 *
 * Google and LINE sign-in run in the phone's browser and hand back to the
 * web view (sign-in.ts). Native push waits on Privacy & Security's notice
 * line for Expo, which lands with Core's server side.
 *
 * Privacy: the session is the site's normal HttpOnly cookie inside the web
 * view; the app stores no token of its own and has no analytics or crash SDK.
 */
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { ActivityIndicator, Alert, BackHandler, Platform, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation, type WebViewProps } from 'react-native-webview';

import { BEGIN_MESSAGE, beginScript, finishScript, makePkce, openSignIn, providerFrom, type Provider } from '@/lib/sign-in';

// react-native-webview 14 types its class as WebView<P = undefined>, and
// WebViewProps & undefined is `never` under current TypeScript. Same component, usable props.
type Shell = WebView<object>;
const Web = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<Shell> }>;

export const SITE = 'https://jurrgun.apps.sv-academy.org';
const SITE_HOST = new URL(SITE).host;

/** Sign-in providers that refuse to run inside an embedded web view. */
const SIGN_IN_HOSTS = ['accounts.google.com', 'access.line.me'];

/** Schemes that belong to another app on the phone. */
const HAND_OFF = /^(tel|mailto|sms|line|geo|maps|comgooglemaps|intent):/i;

const COLORS = {
  light: { bg: '#fff9f0', text: '#0b3520', muted: '#4a5d52', brand: '#137f45', onBrand: '#ffffff' },
  dark: { bg: '#0b3520', text: '#fff9f0', muted: '#c9d8cf', brand: '#3fbf77', onBrand: '#0b3520' },
};

/** A site path from a jurrgun://path link or a link to the site itself. */
function pathFrom(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && u.host === SITE_HOST) return u.pathname + u.search;
    const { hostname, path, queryParams } = Linking.parse(url);
    const p = '/' + [hostname, path].filter(Boolean).join('/');
    if (p === '/auth' || p.startsWith('/auth/') || p.startsWith('/--/auth')) return null;
    const q = new URLSearchParams(queryParams as Record<string, string>).toString();
    return p.startsWith('//') ? null : p + (q ? `?${q}` : '');
  } catch {
    return null;
  }
}

export default function JurrgunShell() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = COLORS[scheme];
  const web = useRef<Shell>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [offline, setOffline] = useState(false);
  // Sign-in waits on the network twice with nothing to see (owner: "a bit of a freeze"): show that it's working.
  const [signing, setSigning] = useState<null | 'start' | 'finish'>(null);
  const finishing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [source, setSource] = useState<{ uri: string }>({ uri: SITE + '/' });
  const busy = useRef(false);
  // Where the web view is now; who is waiting for the next page load or for the begin step's answer.
  const here = useRef(SITE + '/');
  const loadWaiters = useRef<(() => void)[]>([]);
  const beginWaiters = useRef(new Map<string, (ok: boolean) => void>());

  // A jurrgun:// link that opened (or reopened) the app goes to its page.
  const incoming = Linking.useLinkingURL();
  useEffect(() => {
    const p = pathFrom(incoming);
    if (p) setSource({ uri: SITE + p });
  }, [incoming]);

  // Android back: back through the site's pages first, then leave the app.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        web.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const onNav = useCallback((nav: WebViewNavigation) => {
    setCanGoBack(nav.canGoBack);
    here.current = nav.url;
  }, []);

  const onSite = () => {
    try {
      return new URL(here.current).host === SITE_HOST;
    } catch {
      return false;
    }
  };

  /** Both sign-in steps must run on a page of the site (same-origin fetches). Opens /login if needed. */
  const ensureOnSite = useCallback(async (): Promise<boolean> => {
    if (onSite()) return true;
    const loaded = new Promise<void>((resolve) => loadWaiters.current.push(resolve));
    setSource({ uri: SITE + '/login' });
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 20_000))]);
    return onSite();
  }, []);

  const begin = useCallback((challenge: string): Promise<boolean> => {
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        beginWaiters.current.delete(id);
        resolve(false);
      }, 15_000);
      beginWaiters.current.set(id, (ok) => {
        clearTimeout(timer);
        beginWaiters.current.delete(id);
        resolve(ok);
      });
      web.current?.injectJavaScript(beginScript(challenge, id));
    });
  }, []);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as { type?: string; id?: string; ok?: boolean };
      if (m.type === BEGIN_MESSAGE && typeof m.id === 'string') beginWaiters.current.get(m.id)?.(m.ok === true);
    } catch {}
  }, []);

  const failed = (reason: 'failed' | 'busy') =>
    Alert.alert(
      'เข้าสู่ระบบไม่สำเร็จ · Couldn\'t sign in',
      reason === 'busy'
        ? 'มีคนเข้าสู่ระบบอยู่มาก ลองใหม่อีกครั้งในอีกสักครู่\nLots of people are signing in. Try again in a moment.'
        : 'ลองใหม่อีกครั้ง หรือใช้อีเมลเข้าสู่ระบบ\nTry again, or sign in with your email.',
    );

  /** Google or LINE: begin in the web view, sign in in the phone's browser, finish in the web view. */
  const startSignIn = useCallback(
    async (provider: Provider) => {
      if (busy.current) return;
      busy.current = true;
      setSigning('start');
      let handedOver = false;
      try {
        const { verifier, challenge } = await makePkce();
        if (!(await ensureOnSite()) || !(await begin(challenge))) return failed('failed');
        const r = await openSignIn(SITE, provider, challenge);
        if (!r.ok) {
          if (r.reason !== 'cancelled') failed(r.reason);
          return;
        }
        setSigning('finish');
        if (!(await ensureOnSite())) return failed('failed');
        // The overlay stays until the signed-in page loads (onLoadEnd), or 20 seconds at most.
        handedOver = true;
        if (finishing.current) clearTimeout(finishing.current);
        finishing.current = setTimeout(() => {
          finishing.current = null;
          setSigning(null);
        }, 20_000);
        web.current?.injectJavaScript(finishScript(r.code, verifier));
      } catch {
        failed('failed');
      } finally {
        busy.current = false;
        if (!handedOver) setSigning(null);
      }
    },
    [begin, ensureOnSite],
  );

  const shouldLoad = useCallback(({ url }: { url: string }) => {
    if (url.startsWith('about:') || url.startsWith('blob:') || url.startsWith('data:')) return true;
    if (HAND_OFF.test(url)) {
      Linking.openURL(url).catch(() => {});
      return false;
    }
    let host = '';
    try {
      host = new URL(url).host;
    } catch {
      return false;
    }
    // The site's Google and LINE buttons: run them in the phone's browser instead.
    const provider = providerFrom(SITE, url);
    if (provider) {
      startSignIn(provider);
      return false;
    }
    if (host === SITE_HOST) return true;
    // Reached Google or LINE some other way: same as the buttons.
    if (SIGN_IN_HOSTS.includes(host)) {
      startSignIn(host === 'access.line.me' ? 'line' : 'google');
      return false;
    }
    // Anywhere else opens in the phone's browser, outside the app.
    WebBrowser.openBrowserAsync(url).catch(() => {});
    return false;
  }, [startSignIn]);

  const retry = useCallback(() => {
    setOffline(false);
    web.current?.reload();
  }, []);

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <Web
        ref={web}
        source={source}
        style={[styles.fill, { backgroundColor: c.bg }]}
        applicationNameForUserAgent="JurrgunApp/1.0"
        originWhitelist={['https://*', 'http://*', 'about:*', 'blob:*', 'data:*', ...['tel', 'mailto', 'sms', 'line', 'geo', 'maps', 'intent'].map((s) => `${s}:*`)]}
        onShouldStartLoadWithRequest={shouldLoad}
        onNavigationStateChange={onNav}
        onMessage={onMessage}
        onLoadEnd={() => {
          SplashScreen.hideAsync().catch(() => {});
          // A sign-in step waiting for a page of the site to finish loading.
          const waiting = loadWaiters.current;
          loadWaiters.current = [];
          waiting.forEach((resolve) => resolve());
          // The page after finishing sign-in has loaded: the overlay goes.
          if (finishing.current) {
            clearTimeout(finishing.current);
            finishing.current = null;
            setSigning(null);
          }
        }}
        onError={() => {
          setOffline(true);
          SplashScreen.hideAsync().catch(() => {});
        }}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled={false}
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        mediaPlaybackRequiresUserAction
        allowsInlineMediaPlayback
        geolocationEnabled={false}
        decelerationRate="normal"
      />
      {signing ? (
        <View style={[StyleSheet.absoluteFill, styles.signing, { backgroundColor: c.bg }]} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={c.brand} />
          <Text style={[styles.p, { color: c.text, textAlign: 'center' }]}>
            {signing === 'start' ? 'กำลังเปิดหน้าเข้าสู่ระบบ…\nOpening sign-in…' : 'กำลังพาคุณเข้า Jurrgun…\nSigning you in…'}
          </Text>
        </View>
      ) : null}
      {offline ? (
        <View style={[StyleSheet.absoluteFill, styles.offline, { backgroundColor: c.bg }]} accessibilityRole="alert">
          <Text style={[styles.h1, { color: c.text }]}>คุณออฟไลน์อยู่</Text>
          <Text style={[styles.h2, { color: c.text }]}>You're offline</Text>
          <Text style={[styles.p, { color: c.muted }]}>
            ไม่มีอินเทอร์เน็ต ต่อเน็ตได้แล้วค่อยลองใหม่นะ{'\n'}There's no internet connection. Try again when you're back online.
          </Text>
          <Pressable
            onPress={retry}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, { backgroundColor: c.brand, opacity: pressed ? 0.8 : 1 }]}>
            <Text style={[styles.buttonText, { color: c.onBrand }]}>ลองใหม่ · Try again</Text>
          </Pressable>
          <Text style={[styles.p, { color: c.muted }]}>
            เหตุด่วน แจ้งตำรวจ · Police: <Text style={styles.link} onPress={() => Linking.openURL('tel:191')}>191</Text>
            {'\n'}เจ็บป่วยฉุกเฉิน · Medical: <Text style={styles.link} onPress={() => Linking.openURL('tel:1669')}>1669</Text>
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  offline: { padding: 24, justifyContent: 'center', gap: 12 },
  signing: { alignItems: 'center', justifyContent: 'center', gap: 16, opacity: 0.96 },
  h1: { fontSize: 28, fontWeight: '700' },
  h2: { fontSize: 20, fontWeight: '600' },
  p: { fontSize: 16, lineHeight: 24 },
  button: { alignSelf: 'flex-start', paddingVertical: 14, paddingHorizontal: 22, borderRadius: 999, marginVertical: 8 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  link: { textDecorationLine: 'underline', fontWeight: '700' },
});
