/**
 * Keeps the home-screen widget current (owner card S4). The app reads /api/app/next-table from
 * inside its web view (the member's own session, no token), applies the member's "show the place"
 * choice, and stores only what the widget shows: start and end time, cancelled, the place if
 * allowed, and the pass path. A signed-out answer blanks the widget.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ExtensionStorage } from '@bacons/apple-targets';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';

import type { WidgetData } from '@/widget/copy';
import { NextTableWidget } from '@/widget/NextTableWidget';
import { ANDROID_WIDGET_KEY } from '@/widget/task-handler';

export const WIDGET_MESSAGE = 'jurrgun-widget';
export const WIDGET_PLACE_MESSAGE = 'jurrgun-widget-place';
const PLACE_KEY = 'jurrgun.widget.place';
const ios = Platform.OS === 'ios' ? new ExtensionStorage('group.app.jurrgun') : null;

export async function placeOn(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(PLACE_KEY)) === '1';
  } catch {
    return false;
  }
}
export async function setPlace(on: boolean): Promise<void> {
  try {
    if (on) await SecureStore.setItemAsync(PLACE_KEY, '1');
    else await SecureStore.deleteItemAsync(PLACE_KEY);
  } catch {}
}

/** Run in the web view: ask for the next table and hand it to the app. */
export function fetchScript(lang: string): string {
  const post = (x: string) => `window.ReactNativeWebView.postMessage(JSON.stringify({type:${JSON.stringify(WIDGET_MESSAGE)},${x}}))`;
  return (
    `fetch("/api/app/next-table?lang=${lang === 'en' ? 'en' : 'th'}",{credentials:"same-origin",redirect:"manual"})` +
    `.then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){${post('signedIn:true,table:j.table')}})` +
    `.catch(function(){${post('signedIn:false,table:null')}});true;`
  );
}

type Answer = { startsAt: string; endsAt: string; cancelled: boolean; place: string | null; pass: string } | null;

/** Store what the widget may show (or nothing), then ask both platforms to redraw. */
export async function saveWidget(table: Answer, lang: string): Promise<void> {
  const show = await placeOn();
  const data: WidgetData | null = table
    ? {
        startsAt: Date.parse(table.startsAt),
        endsAt: Date.parse(table.endsAt),
        cancelled: table.cancelled ? 1 : 0,
        place: show && table.place ? table.place : '',
        pass: /^\/me\/events\/[A-Za-z0-9_-]+\/pass$/.test(table.pass) ? table.pass : '/me/events',
        lang: lang === 'en' ? 'en' : 'th',
      }
    : null;
  try {
    if (ios) {
      ios.set('next', data ?? undefined);
      ExtensionStorage.reloadWidget();
    } else if (Platform.OS === 'android') {
      if (data) await AsyncStorage.setItem(ANDROID_WIDGET_KEY, JSON.stringify(data));
      else await AsyncStorage.removeItem(ANDROID_WIDGET_KEY);
      await requestWidgetUpdate({ widgetName: 'NextTable', renderWidget: () => <NextTableWidget data={data} now={Date.now()} /> });
    }
  } catch {}
}

export function placeStateScript(on: boolean): string {
  return `dispatchEvent(new CustomEvent(${JSON.stringify(WIDGET_PLACE_MESSAGE)},{detail:{on:${on}}}));true;`;
}
