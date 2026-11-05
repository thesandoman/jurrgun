/**
 * Push notifications in the app (server side: Core Platform, src/lib/expo-push.ts on the site).
 *
 * The site's "Notifications on this phone" switch posts {type:"jurrgun-push", on} to the app.
 * The app asks the phone for permission only then (never on launch), gets its Expo push token and
 * registers it through the web view's own session, so the token belongs to this signed-in session
 * and is deleted at sign-out. Payloads are "Jurrgun" plus one generic line (Privacy & Security);
 * a tap opens data.url, a path on the site. No token is stored by the app.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// A notification that arrives while the app is open still shows, quietly.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export const PUSH_MESSAGE = 'jurrgun-push';

export type PushAnswer = { ok: boolean; on?: boolean; denied?: boolean };

/** The phone's Expo push token, asking for permission first when `ask` is set. */
export async function expoToken(ask: boolean): Promise<{ token?: string; denied?: boolean }> {
  if (!Device.isDevice) return {};
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Jurrgun', importance: Notifications.AndroidImportance.DEFAULT });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { denied: true };
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  try {
    return { token: (await Notifications.getExpoPushTokenAsync({ projectId })).data };
  } catch {
    return {};
  }
}

/** Run in the web view: register or remove the token with this page's session, then tell the switch. */
export function registerScript(token: string, on: boolean): string {
  const url = on ? '/settings/push' : '/settings/push/off';
  const body = on ? { expoToken: token } : { endpoint: token };
  return (
    `fetch(${JSON.stringify(url)},{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:${JSON.stringify(JSON.stringify(body))}})` +
    `.then(function(r){dispatchEvent(new CustomEvent(${JSON.stringify(PUSH_MESSAGE)},{detail:{ok:r.ok,on:${on}}}))})` +
    `.catch(function(){dispatchEvent(new CustomEvent(${JSON.stringify(PUSH_MESSAGE)},{detail:{ok:false}}))});true;`
  );
}

/** Tell the switch something went wrong before any request was made. */
export function answerScript(a: PushAnswer): string {
  return `dispatchEvent(new CustomEvent(${JSON.stringify(PUSH_MESSAGE)},{detail:${JSON.stringify(a)}}));true;`;
}

/** The site path a tapped notification opens, or null. */
export function tappedPath(r: Notifications.NotificationResponse | null | undefined): string | null {
  const url = r?.notification.request.content.data?.url;
  return typeof url === 'string' && /^\/(?!\/)[A-Za-z0-9/_.~?=&%-]*$/.test(url) ? url : null;
}
