/** Siri and Shortcuts: add water, log a meal as planned, ask what is next. */
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = config => ({
  type: 'app-intent',
  name: 'HealthSiri',
  deploymentTarget: '17.0',
  entitlements: { 'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'] },
})
