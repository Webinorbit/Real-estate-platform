import math

PLAN_DEFS = {
    "STARTER": {
        "label": "Starter", "maxListings": 25, "maxBrokers": 3,
        "tours": False, "routingRules": False, "slaAutomation": False, "customDomain": False,
        "csvImport": False, "webhooks": False, "removeBranding": False,
    },
    "PRO": {
        "label": "Pro", "maxListings": 250, "maxBrokers": 25,
        "tours": True, "routingRules": True, "slaAutomation": True, "customDomain": True,
        "csvImport": True, "webhooks": False, "removeBranding": False,
    },
    "ENTERPRISE": {
        "label": "Enterprise", "maxListings": math.inf, "maxBrokers": math.inf,
        "tours": True, "routingRules": True, "slaAutomation": True, "customDomain": True,
        "csvImport": True, "webhooks": True, "removeBranding": True,
    },
}

FEATURE_KEYS = ("tours", "routingRules", "slaAutomation", "customDomain", "csvImport", "webhooks", "removeBranding")
PLAN_NAMES = tuple(PLAN_DEFS)


def plan_of(tenant) -> dict:
    return PLAN_DEFS.get(getattr(tenant, "plan", None), PLAN_DEFS["STARTER"])


def can(tenant, feature: str) -> bool:
    return bool(plan_of(tenant).get(feature))


def limit_of(tenant, key: str) -> float:
    return plan_of(tenant)[key]


def features_json(tenant) -> dict:
    """JSON-safe view of the plan (Infinity becomes null = unlimited)."""
    p = plan_of(tenant)
    out = {k: bool(p[k]) for k in FEATURE_KEYS}
    out["label"] = p["label"]
    out["maxListings"] = None if math.isinf(p["maxListings"]) else p["maxListings"]
    out["maxBrokers"] = None if math.isinf(p["maxBrokers"]) else p["maxBrokers"]
    return out
