/**
 * Jurrgun app, v1: an Expo shell around the live site (owner, 2026-11-05:
 * "Expo shell first").
 *
 * The site does the work; the shell adds what a website can't do well on a
 * phone: Android's back button, a native offline screen, phone links
 * (tel:, LINE, maps) handed to the right app, outside links in the system
 * browser, and jurrgun:// links that open a page in the app.
 *
 * Not in v1, waiting on Core Platform: Google and LINE sign-in (Google
 * refuses sign-in inside an embedded web view, so it has to run in the
 * system browser and hand back to the app) and native push (Expo tokens).
 * Until then, sign-in inside the app is by email code.
 *
 * Privacy: the session is the site's normal cookie inside the web view; the
 * app stores no token of its own and has no analytics or crash SDK.
 */
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { Alert, BackHandler, Platform, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation, type WebViewProps } from 'react-native-webview';

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
  const [uri, setUri] = useState(SITE + '/');

  // A jurrgun:// link that opened (or reopened) the app goes to its page.
  const incoming = Linking.useLinkingURL();
  useEffect(() => {
    const p = pathFrom(incoming);
    if (p) setUri(SITE + p);
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

  const onNav = useCallback((nav: WebViewNavigation) => setCanGoBack(nav.canGoBack), []);

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
    if (host === SITE_HOST) return true;
    if (SIGN_IN_HOSTS.includes(host)) {
      Alert.alert(
        'ยังเข้าสู่ระบบด้วยวิธีนี้ในแอปไม่ได้ · Not in the app yet',
        'ตอนนี้ในแอปใช้อีเมลเข้าสู่ระบบได้ก่อน\nFor now, sign in with your email in the app. Google and LINE sign-in are coming.',
      );
      return false;
    }
    // Anywhere else opens in the phone's browser, outside the app.
    WebBrowser.openBrowserAsync(url).catch(() => {});
    return false;
  }, []);

  const retry = useCallback(() => {
    setOffline(false);
    web.current?.reload();
  }, []);

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <Web
        ref={web}
        source={{ uri }}
        style={[styles.fill, { backgroundColor: c.bg }]}
        applicationNameForUserAgent="JurrgunApp/1.0"
        originWhitelist={['https://*', 'http://*', 'about:*', 'blob:*', 'data:*', ...['tel', 'mailto', 'sms', 'line', 'geo', 'maps', 'intent'].map((s) => `${s}:*`)]}
        onShouldStartLoadWithRequest={shouldLoad}
        onNavigationStateChange={onNav}
        onLoadEnd={() => SplashScreen.hideAsync().catch(() => {})}
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
  h1: { fontSize: 28, fontWeight: '700' },
  h2: { fontSize: 20, fontWeight: '600' },
  p: { fontSize: 16, lineHeight: 24 },
  button: { alignSelf: 'flex-start', paddingVertical: 14, paddingHorizontal: 22, borderRadius: 999, marginVertical: 8 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  link: { textDecorationLine: 'underline', fontWeight: '700' },
});
