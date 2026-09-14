/**
 * Single source of truth for subscription plans.
 *
 * Previously `User.plan` was a free-form string with no effect: every account
 * got monthlyQuota=1000 and a hardcoded 5-device limit, so the pricing table on
 * the landing page promised limits the backend never enforced. Plans now drive
 * quota, device limits, and feature access from one place.
 */

export const PLAN_IDS = ["free", "pro", "business"];

export const PLANS = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    priceLabel: "Rp0",
    period: "/bulan",
    monthlyQuota: 1_000,
    maxDevices: 1,
    features: ["1 device WhatsApp", "1.000 pesan/bulan", "Single chat & broadcast", "REST API + Swagger"],
    highlighted: false,
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 99_000,
    priceLabel: "Rp99rb",
    period: "/bulan",
    monthlyQuota: 25_000,
    maxDevices: 3,
    features: ["3 device WhatsApp", "25.000 pesan/bulan", "Queue prioritas", "Webhook & laporan ekspor"],
    highlighted: true,
  },
  business: {
    id: "business",
    name: "Business",
    price: 299_000,
    priceLabel: "Rp299rb",
    period: "/bulan",
    monthlyQuota: 100_000,
    maxDevices: 10,
    features: ["10 device WhatsApp", "100.000 pesan/bulan", "Support prioritas", "SLA & on-premise"],
    highlighted: false,
  },
};

/** Global ceiling applied on top of any plan, set by admins. */
export const GLOBAL_MAX_DEVICES = 20;

export const DEFAULT_PLAN = "free";

export function getPlan(planId) {
  return PLANS[planId] ?? PLANS[DEFAULT_PLAN];
}

export function isValidPlan(planId) {
  return PLAN_IDS.includes(planId);
}

/**
 * Effective device allowance for a user.
 * The plan sets the limit; `deviceLimitOverride` lets an admin raise or lower it
 * per user, but never above the global ceiling.
 */
export function effectiveDeviceLimit(user) {
  const planLimit = getPlan(user?.plan).maxDevices;
  const override = Number.isFinite(user?.deviceLimitOverride) ? user.deviceLimitOverride : null;
  const chosen = override ?? planLimit;
  return Math.max(1, Math.min(chosen, GLOBAL_MAX_DEVICES));
}

export function publicPlanCatalog() {
  return PLAN_IDS.map((id) => {
    const plan = PLANS[id];
    return {
      id: plan.id,
      name: plan.name,
      price: plan.price,
      priceLabel: plan.priceLabel,
      period: plan.period,
      monthlyQuota: plan.monthlyQuota,
      maxDevices: plan.maxDevices,
      features: plan.features,
      highlighted: plan.highlighted,
    };
  });
}
