/** The Android home-screen widget (react-native-android-widget). Same rules as the iPhone one. */
import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { countdown, when, words, type WidgetData } from './copy';

const GREEN = '#137f45';
const INK = '#0b3520';
const MUTED = '#4a5d52';
const CREAM = '#fff9f0';

export function NextTableWidget({ data, now }: { data: WidgetData | null; now: number }) {
  const lang = data?.lang ?? 'th';
  const w = words(lang);
  const live = data && data.endsAt > now ? data : null;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: live ? `jurrgun://${live.pass.replace(/^\//, '')}` : 'jurrgun://me/events' }}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: CREAM, borderRadius: 22, padding: 14, flexDirection: 'column', justifyContent: 'space-between' }}>
      <TextWidget text={w.header} style={{ fontSize: 13, color: GREEN, fontWeight: '700' }} />
      {live ? (
        live.cancelled ? (
          <TextWidget text={w.cancelled} style={{ fontSize: 16, color: INK, fontWeight: '700' }} />
        ) : (
          <FlexWidget style={{ flexDirection: 'column' }}>
            <TextWidget text={countdown(live.startsAt, now, lang)} style={{ fontSize: 18, color: INK, fontWeight: '700' }} />
            <TextWidget text={when(live.startsAt, now, lang)} style={{ fontSize: 13, color: MUTED }} />
            <TextWidget text={live.place || w.table} maxLines={1} truncate="END" style={{ fontSize: 13, color: MUTED }} />
          </FlexWidget>
        )
      ) : (
        <TextWidget text={w.none} style={{ fontSize: 15, color: MUTED }} />
      )}
    </FlexWidget>
  );
}
