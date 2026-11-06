/** Renders the Android widget from what the app last stored (the widget never fetches by itself). */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import type { WidgetData } from './copy';
import { NextTableWidget } from './NextTableWidget';

export const ANDROID_WIDGET_KEY = 'jurrgun.widget.next';

export async function readWidgetData(): Promise<WidgetData | null> {
  try {
    const raw = await AsyncStorage.getItem(ANDROID_WIDGET_KEY);
    return raw ? (JSON.parse(raw) as WidgetData) : null;
  } catch {
    return null;
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetAction === 'WIDGET_DELETED') return;
  props.renderWidget(<NextTableWidget data={await readWidgetData()} now={Date.now()} />);
}
