export const PLAN_DEFS = {
  STARTER: {
    label: "Starter",
    maxListings: 25,
    maxBrokers: 3,
    tours: false,
    routingRules: false,
    slaAutomation: false,
    customDomain: false,
    csvImport: false,
    webhooks: false,
    removeBranding: false,
    priceHint: "For solo agents getting online",
  },
  PRO: {
    label: "Pro",
    maxListings: 250,
    maxBrokers: 25,
    tours: true,
    routingRules: true,
    slaAutomation: true,
    customDomain: true,
    csvImport: true,
    webhooks: false,
    removeBranding: false,
    priceHint: "For growing agencies",
  },
  ENTERPRISE: {
    label: "Enterprise",
    maxListings: Infinity,
    maxBrokers: Infinity,
    tours: true,
    routingRules: true,
    slaAutomation: true,
    customDomain: true,
    csvImport: true,
    webhooks: true,
    removeBranding: true,
    priceHint: "For brokerages and developers",
  },
};

export function planOf(tenant) {
  return PLAN_DEFS[tenant?.plan] || PLAN_DEFS.STARTER;
}

export function can(tenant, feature) {
  return Boolean(planOf(tenant)[feature]);
}

export function limitOf(tenant, key) {
  return planOf(tenant)[key];
}

export function planError(feature) {
  return `Your current plan does not include ${feature}. Upgrade to unlock it.`;
}
