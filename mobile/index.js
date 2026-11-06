// Entry: Expo Router, plus the Android home-screen widget's task handler (owner card S4).
import 'expo-router/entry';
import { Platform } from 'react-native';

// The home-screen widget exists only on Android here (iPhone's is native Swift); never on the web.
if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widget/task-handler');
  registerWidgetTaskHandler(widgetTaskHandler);
}
