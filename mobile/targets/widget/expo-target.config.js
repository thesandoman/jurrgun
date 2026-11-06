/**
 * The iPhone "Your next table" widget (owner card S4). It reads only what the app stored in the
 * shared App Group; it never fetches by itself and never holds a session.
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'JurrgunWidget',
  displayName: 'Jurrgun',
  deploymentTarget: '17.0',
  colors: { $accent: { color: '#137f45', darkColor: '#3fbf77' }, $widgetBackground: { color: '#fff9f0', darkColor: '#0b3520' } },
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
