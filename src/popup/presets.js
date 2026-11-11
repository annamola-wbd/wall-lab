/**
 * Built-in setups. Each one sets only what that wall needs; anything left out
 * inherits the local stack's config.
 */

const meterEnv = {
  PAYWALL_FEATURE_ENABLED: true,
  METERED_PAYWALL_FEATURE_ENABLED: true
};
const subOnlyEnv = {
  PAYWALL_FEATURE_ENABLED: true,
  SUB_ONLY_PAYWALL_FEATURE_ENABLED: true
};
const meterPage = {
  showPaywall: 'true',
  subscriptionOnly: 'false',
  showRegwall: 'false'
};

export const PRESETS = [
  {
    id: 'preset-us-metered-wall',
    name: 'US · Metered paywall',
    location: 'US',
    gates: { showPaywall: 'true', subscriptionOnly: 'false', showRegwall: 'false' },
    env: { REGWALL_FEATURE_ENABLED: true },
    regionFlags: {
      regwallOff: false,
      regwallMeterMax: 1
    }
  }
];
