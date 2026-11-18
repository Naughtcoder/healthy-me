/** Home and lock screen widgets: the next thing due, the eating window, water. */
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = config => ({
  type: 'widget',
  name: 'HealthWidget',
  deploymentTarget: '17.0',
  colors: { $widgetBackground: { light: '#FFFFFF', dark: '#0B0B0C' }, $accent: '#2E6E80', meals: '#E8A47E', water: '#9CC0CA' },
  entitlements: { 'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'] },
})
