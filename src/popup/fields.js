/**
 * Field registry for the popup form. Keys mirror content-hub:
 *  - region flags: `FLAG_DEFAULTS` in app/services/client/user-account-reg-wall/region-config.js
 *  - env flags: client-allowlisted keys in app/app.js
 *  - gates: wall data attributes on the article / live-story templates
 * When content-hub adds or renames one of these, update it here.
 */

export const INHERIT = '__inherit__';

export const ACTIVE_KEY = 'wallLab:active';

export const BASELINE_KEY = 'wallLab:baseline';

export const GEO_TO_REGION = { US: 'US', GB: 'UK', CA: 'CA' };

export const LOCATIONS = [
  { value: 'US', label: 'US' },
  { value: 'GB', label: 'UK (GB)' },
  { value: 'CA', label: 'CA' }
];

export const STATES = [
  { value: 'VT', label: 'Vermont' },
  { value: 'NY', label: 'Not Vermont' }
];

export const GATES = [
  { key: 'showPaywall', label: 'Metered paywall on page' },
  { key: 'subscriptionOnly', label: 'Subscriber-only page' },
  { key: 'showRegwall', label: 'Regwall on page' }
];

export const REGION_FLAG_GROUPS = [
  {
    title: 'Meter paywall',
    fields: [
      { key: 'meterPaywallOff', type: 'bool', label: 'Off' },
      { key: 'meterPaywallMeterMax', type: 'number', label: 'Meter max' },
      { key: 'meterPaywallVariation', type: 'text', label: 'Variation' },
      {
        key: 'meterPaywallPvLossResetEnabled',
        type: 'bool',
        label: 'Pageview-loss reset'
      },
      {
        key: 'meterPaywallResetStorageEnabled',
        type: 'bool',
        label: 'Reset storage'
      }
    ]
  },
  {
    title: 'Subscriber-only paywall',
    fields: [
      { key: 'subOnlyPaywallOff', type: 'bool', label: 'Off' },
      { key: 'subOnlyPaywallVariation', type: 'text', label: 'Variation' },
      {
        key: 'subOnlyPaywallVariationViewChangeMax',
        type: 'number',
        label: 'Variation view change max'
      }
    ]
  },
  {
    title: 'Regwall',
    fields: [
      { key: 'regwallOff', type: 'bool', label: 'Off' },
      { key: 'regwallMeterMax', type: 'number', label: 'Meter max' },
      {
        key: 'regwallAllowSubOnlyAccess',
        type: 'bool',
        label: 'Allow sub-only access'
      },
      {
        key: 'regwallAllowFreeAccess',
        type: 'bool',
        label: 'Allow free access'
      },
      {
        key: 'regwallAllowViaOptimizely',
        type: 'bool',
        label: 'Allow via Optimizely'
      }
    ]
  },
  {
    title: 'Live story',
    fields: [
      { key: 'livestoryPaywallOff', type: 'bool', label: 'Off' },
      {
        key: 'livestoryPaywallMeterEnabled',
        type: 'bool',
        label: 'Meter enabled'
      }
    ]
  },
  {
    title: 'Offer and checkout',
    fields: [
      { key: 'subscriptionOfferType', type: 'text', label: 'Offer type' },
      {
        key: 'paywallExpressCheckoutEnabled',
        type: 'bool',
        label: 'Express checkout'
      },
      {
        key: 'paywallExpressCheckoutVariation',
        type: 'text',
        label: 'Express checkout variation'
      },
      {
        key: 'paywallEmailCaptureEnabled',
        type: 'bool',
        label: 'Email capture'
      }
    ]
  },
  {
    title: 'Buttons',
    fields: [
      {
        key: 'watchButtonMarketingRedirectEnabled',
        type: 'bool',
        label: 'Watch button marketing redirect'
      },
      {
        key: 'navSubscribeButtonEnabled',
        type: 'bool',
        label: 'Nav subscribe button'
      }
    ]
  }
];

export const ENV_FIELDS = [
  { key: 'PAYWALL_FEATURE_ENABLED', label: 'PAYWALL_FEATURE_ENABLED' },
  {
    key: 'METERED_PAYWALL_FEATURE_ENABLED',
    label: 'METERED_PAYWALL_FEATURE_ENABLED'
  },
  {
    key: 'SUB_ONLY_PAYWALL_FEATURE_ENABLED',
    label: 'SUB_ONLY_PAYWALL_FEATURE_ENABLED'
  },
  { key: 'REGWALL_FEATURE_ENABLED', label: 'REGWALL_FEATURE_ENABLED' },
  { key: 'WATCH_PAYWALL_ENABLED', label: 'WATCH_PAYWALL_ENABLED' },
  {
    key: 'LIVESTORY_PAYWALL_FEATURE_ENABLED',
    label: 'LIVESTORY_PAYWALL_FEATURE_ENABLED'
  },
  {
    key: 'DYNAMIC_CONFIG.google_eafs_enabled',
    label: 'google_eafs_enabled (dynamic)'
  }
];
