"""Seeds three demo tenants (Enterprise, Pro, Starter) with properties, brokers, tours, routing rules and leads.

Idempotent: re-running wipes and recreates the demo tenants only (plus every tenant-less user, i.e. the platform
super-admin), then rebuilds them. Everything happens in one transaction, so a failure leaves the database untouched.

Port of prisma/seed.mjs. The pseudo-random generator is the same mulberry32 the JS used, so the generated data
(furnishing, floors, views, lead mix, timestamps relative to "now") is the same for the same seed.
"""

import math
import re
import secrets
import time
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import delete, select

from app.config import env
from app.cli.demo_data import AMENITY_KITS, BROKERS, LEAD_MESSAGES, LEAD_NAMES, PROPERTIES, TENANTS, TOUR_SCENES
from app.cli.demo_floorplans import FLOORPLANS, PLAN_H, PLAN_W, room_center
from app.ids import _base36
from app.models import Assignment, Broker, Hotspot, Lead, LeadActivity, Property, RoutingRule, Scene, Tenant, Tour, User, utcnow
from app.plans import PLAN_DEFS
from app.routing.engine import route_lead
from app.security import hash_password
from app.slug import slugify

PASSWORD = "demo1234"
DAY = timedelta(days=1)
MASK = 0xFFFFFFFF

INTERIORS = [f"int-{i + 1:02d}" for i in range(16)]
OPEN_STATUSES = ("NEW", "CONTACTED", "VIEWING", "NEGOTIATION")


def rng(seed: int):
    """mulberry32, bit-for-bit the same sequence as the JS version."""
    a = seed & MASK

    def rand() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & MASK
        t = ((a ^ (a >> 15)) * (1 | a)) & MASK
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & MASK)) & MASK) ^ t
        return ((t ^ (t >> 14)) & MASK) / 4294967296

    return rand


_id_state = {"ms": 0, "n": 0}


def seq_id() -> str:
    """Same shape as app.ids.new_id() but strictly increasing within the process.

    The routing engine breaks ties between brokers by id, so ids that sort in creation order make the very first
    round-robin pick deterministic, exactly as cuids did in the JS seed.
    """
    ms = int(time.time() * 1000)
    if ms <= _id_state["ms"]:
        ms = _id_state["ms"]
        _id_state["n"] += 1
    else:
        _id_state["ms"], _id_state["n"] = ms, 0
    return f"c{_base36(ms)}{_id_state['n']:04x}{secrets.token_hex(6)}"


def js_round(x: float) -> int:
    return int(math.floor(x + 0.5))


def to_fixed(x: float, digits: int) -> float:
    """Number(x.toFixed(digits)): exact decimal expansion, ties away from zero like JS."""
    return float(Decimal(x).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP))


def en_in(n: int) -> str:
    """toLocaleString('en-IN'): last three digits, then groups of two."""
    s = str(abs(n))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
        s = f"{head},{tail}"
    return ("-" if n < 0 else "") + s


def photo(key: str) -> str:
    return f"/demo/photos/{key}.jpg"


def describe(title, type_, loc, city, beds, area) -> str:
    bedrooms = f"{beds}-bedroom " if beds else ""
    lead = {
        "VILLA": f"A rare standalone villa in {loc}, designed around light, privacy and generous outdoor living.",
        "PENTHOUSE": f"A commanding penthouse in {loc} with uninterrupted views and a private sky terrace.",
        "HOUSE": f"A beautifully maintained independent home in {loc} on a quiet, tree-lined street.",
        "PLOT": f"A clear-title plot in {loc}, ready to build, with excellent road frontage.",
        "COMMERCIAL": f"A prime commercial address in {loc} with strong footfall, great connectivity and flexible floor plates.",
        "STUDIO": f"A smartly planned studio in {loc}, ideal for professionals and investors.",
        "APARTMENT": f"A bright, well-planned {bedrooms}apartment in {loc}, minutes from everything that matters.",
    }[type_]
    if area:
        detail = (
            f"Spanning {en_in(js_round(area))} sq ft, {title} pairs thoughtful architecture with premium finishes, "
            "abundant natural light and excellent ventilation."
        )
    else:
        detail = f"{title} offers a flexible canvas with premium surroundings."
    return (
        f"{lead}\n\n{detail} The building is professionally managed with round-the-clock security, and {loc} offers "
        f"schools, hospitals, dining and transit within a short drive across {city}.\n\n"
        "Book a viewing or start the virtual tour to see it for yourself. Our advisors will walk you through "
        "documentation, home-loan options and negotiation."
    )


def yaw_between(plan_key: str, from_key: str, to_key: str) -> float:
    a = room_center(plan_key, from_key)
    b = room_center(plan_key, to_key)
    return math.atan2((b["x"] - a["x"]) * PLAN_W, -((b["y"] - a["y"]) * PLAN_H)) * 180 / math.pi


def add(db, model, **fields):
    obj = model(id=seq_id(), **fields)
    db.add(obj)
    return obj


def demo_users_enabled() -> bool:
    """Demo owner/broker logins (password demo1234) exist only for local dev and the test suite."""
    return env("SEED_DEMO_USERS") == "true"


def admin_account() -> tuple[str, str]:
    if demo_users_enabled():
        return "super@webinorbit.demo", PASSWORD
    email = (env("ADMIN_EMAIL") or "").strip().lower()
    password = env("ADMIN_PASSWORD")
    if email and password:
        return email, password
    raise SystemExit("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env (the single platform admin), or SEED_DEMO_USERS=true for local demo logins.")


def wipe(db) -> None:
    slugs = [t["slug"] for t in TENANTS]
    email, password = admin_account()
    db.execute(delete(User).where(User.tenantId.is_(None)), execution_options={"synchronize_session": False})
    db.execute(delete(Tenant).where(Tenant.slug.in_(slugs)), execution_options={"synchronize_session": False})
    add(db, User, email=email, name="WebInOrbit Admin", role="SUPER", passwordHash=hash_password(password))
    db.flush()


def routing_rule_defs(slug: str, ids) -> list[dict]:
    if slug == "skyline":
        return [
            {"name": "Ultra-luxury (₹10 Cr+) to senior advisors", "priority": 10, "conditions": {"minPrice": 100_000_000, "listingTypes": ["SALE"]}, "strategy": "WEIGHTED", "brokerIds": ids("priya", "arjun"), "slaMinutes": 5},
            {"name": "Commercial and land to investment desk", "priority": 20, "conditions": {"propertyTypes": ["COMMERCIAL", "PLOT"]}, "strategy": "ROUND_ROBIN", "brokerIds": ids("farhan", "ananya"), "slaMinutes": 10},
            {"name": "Rentals desk", "priority": 30, "conditions": {"listingTypes": ["RENT"]}, "strategy": "LEAST_LOADED", "brokerIds": ids("rohan", "neha", "priya", "arjun"), "slaMinutes": 10},
            {"name": "Hindi-speaking leads", "priority": 40, "conditions": {"languages": ["Hindi"]}, "strategy": "ROUND_ROBIN", "brokerIds": [], "matchLanguage": True, "slaMinutes": 15},
            {"name": "Territory specialists", "priority": 50, "conditions": {}, "strategy": "LISTING_AGENT", "brokerIds": [], "useTerritory": True, "slaMinutes": 15},
        ]
    if slug == "heritage":
        return [
            {"name": "Premium homes to principal advisor", "priority": 10, "conditions": {"minPrice": 70_000_000}, "strategy": "LISTING_AGENT", "brokerIds": ids("kavya"), "slaMinutes": 5},
            {"name": "Rentals desk", "priority": 20, "conditions": {"listingTypes": ["RENT"]}, "strategy": "LEAST_LOADED", "brokerIds": ids("vikram", "meera"), "slaMinutes": 10},
            {"name": "Area specialists", "priority": 30, "conditions": {}, "strategy": "ROUND_ROBIN", "brokerIds": [], "useTerritory": True, "slaMinutes": 15},
        ]
    return []


def seed_tenant(db, d: dict, password_hash: str, seed_index: int) -> None:
    rand = rng(1000 + seed_index)
    slug = d["slug"]
    tenant = add(
        db,
        Tenant,
        slug=slug,
        name=d["name"],
        plan=d["plan"],
        tagline=d["tagline"],
        about=d["about"],
        primaryColor=d["primaryColor"],
        accentColor=d["accentColor"],
        fontHeading=d["fontHeading"],
        fontBody=d["fontBody"],
        heroImageUrl=",".join(photo(k) for k in d["heroImages"]),
        contactEmail=d["contactEmail"],
        contactPhone=d["contactPhone"],
        whatsapp=d["whatsapp"],
        address=d["address"],
        mapLat=d["mapLat"],
        mapLng=d["mapLng"],
        mapZoom=d["mapZoom"],
        analyticsSiteId=d["analyticsSiteId"],
        socials={"instagram": "https://instagram.com", "facebook": "https://facebook.com", "linkedin": "https://linkedin.com"},
        slaMinutes=15,
        maxReassigns=2,
    )
    tid = tenant.id
    db.flush()

    broker_users = {}
    if demo_users_enabled():
        add(db, User, tenantId=tid, email=d["owner"]["email"], name=d["owner"]["name"], role="OWNER", passwordHash=password_hash)
        broker_users = {
            b["key"]: add(db, User, tenantId=tid, email=b["email"], name=b["name"], role="BROKER", passwordHash=password_hash)
            for b in BROKERS[slug]
        }
    db.flush()

    broker_by_key: dict[str, Broker] = {}
    for b in BROKERS[slug]:
        user = broker_users.get(b["key"])
        # Omit (rather than set to None) so the column is a real SQL NULL, not a JSON null.
        extra = {"territory": b["territory"]} if b["territory"] else {}
        broker_by_key[b["key"]] = add(
            db,
            Broker,
            **extra,
            tenantId=tid,
            userId=user.id if user else None,
            name=b["name"],
            email=b["email"],
            phone=b["phone"],
            title=b["title"],
            bio=b["bio"],
            photoUrl=photo(b["photo"]),
            languages=b["languages"],
            specialties=b["specialties"],
            areas=b["areas"],
            weight=b["weight"],
            capacity=b["capacity"],
            workingHours=b["hours"],
            timezone="Asia/Kolkata",
            active=True,
        )

    db.flush()

    created = []
    used_slugs: set[str] = set()
    state = "Karnataka" if slug == "heritage" else "Haryana" if slug == "urbannest" else "Maharashtra"
    for i, row in enumerate(PROPERTIES[slug]):
        (title, type_, listing_type, price, beds, baths, area, locality, city, lat, lng, kit, ext, featured, tour_key, broker_key) = row
        ints = [INTERIORS[(i * 3 + k * 4 + 1) % len(INTERIORS)] for k in range(4)]
        gallery = [ext, ext] if type_ == "PLOT" else [ext, *ints]

        p_slug = slugify(title)
        while p_slug in used_slugs:
            p_slug += "-2"
        used_slugs.add(p_slug)

        price_i = js_round(price)
        multi_storey = type_ in ("APARTMENT", "PENTHOUSE", "STUDIO")
        year_built = 2008 + int(rand() * 16)
        if listing_type == "RENT":
            furnishing = ["Furnished", "Semi-furnished"][int(rand() * 2)]
        else:
            furnishing = ["Unfurnished", "Semi-furnished", "Furnished"][int(rand() * 3)]
        parking = 0 if type_ == "PLOT" else 1 + int(rand() * 3)
        floor = 3 + int(rand() * 30) if multi_storey else None
        facing = ["East", "West", "North", "South", "Sea", "Garden"][int(rand() * 6)]
        views = 40 + int(rand() * 900)
        created_at = utcnow() - int(rand() * 60) * DAY

        record = add(
            db,
            Property,
            tenantId=tid,
            slug=p_slug,
            title=title,
            description=describe(re.sub(r" for Rent.*", "", title, count=1), type_, locality, city, beds, area),
            listingType=listing_type,
            type=type_,
            status="ACTIVE",
            price=price_i,
            beds=beds,
            baths=baths,
            areaSqft=area,
            yearBuilt=year_built,
            furnishing=furnishing,
            parking=parking,
            floor=floor,
            totalFloors=35 if multi_storey else None,
            facing=facing,
            address=f"{locality}, {city}",
            locality=locality,
            city=city,
            state=state,
            lat=lat,
            lng=lng,
            amenities=AMENITY_KITS[kit],
            images=[{"url": photo(k), "alt": f"{title} - photo {idx + 1}"} for idx, k in enumerate(gallery)],
            featured=featured,
            views=views,
            listingBrokerId=broker_by_key[broker_key].id if broker_key in broker_by_key else None,
            createdAt=created_at,
        )
        created.append(
            {
                "record": record, "tourKey": tour_key, "lat": lat, "lng": lng, "id": record.id, "type": type_,
                "listingType": listing_type, "price": price_i, "city": city, "locality": locality,
                "listingBrokerId": record.listingBrokerId,
            }
        )

    db.flush()

    for p in (c for c in created if c["tourKey"]):
        tdef = TOUR_SCENES[p["tourKey"]]
        if tdef.get("external"):
            add(db, Tour, tenantId=tid, propertyId=p["id"], title=tdef["title"], kind="EXTERNAL", externalUrl=tdef["external"], published=True)
            continue
        plan = FLOORPLANS[tdef["plan"]]
        scenes_def = tdef["scenes"]
        scene_ids = {s["key"]: seq_id() for s in scenes_def}
        tour = add(
            db,
            Tour,
            tenantId=tid,
            propertyId=p["id"],
            title=tdef["title"],
            kind="PANORAMA",
            floorPlanUrl=f"/demo/floorplans/{tdef['plan']}.svg",
            planFloors={"width": PLAN_W, "height": PLAN_H, "label": plan["title"]},
            published=True,
            autoRotate=True,
            startSceneId=scene_ids[scenes_def[0]["key"]],
        )
        db.flush()
        for k, s in enumerate(scenes_def):
            c = room_center(tdef["plan"], s["key"])
            db.add(
                Scene(
                    id=scene_ids[s["key"]],
                    tenantId=tid,
                    tourId=tour.id,
                    name=s["name"],
                    roomLabel=s["name"],
                    floor=0,
                    panoramaUrl=f"/demo/panos/{s['pano']}.jpg",
                    thumbUrl=f"/demo/panos/{s['pano']}.jpg",
                    planX=to_fixed(c["x"], 4),
                    planY=to_fixed(c["y"], 4),
                    lat=to_fixed(p["lat"] - (c["y"] - 0.5) * 0.0004, 7),
                    lng=to_fixed(p["lng"] + (c["x"] - 0.5) * 0.0006, 7),
                    northYaw=0,
                    initialYaw=0,
                    order=k,
                )
            )
        db.flush()
        n = len(scenes_def)
        for k, s in enumerate(scenes_def):
            nxt = scenes_def[(k + 1) % n]
            prev = scenes_def[(k - 1 + n) % n]
            rows = [
                {"type": "LINK", "yaw": yaw_between(tdef["plan"], s["key"], nxt["key"]), "pitch": -4, "label": nxt["name"], "targetSceneId": scene_ids[nxt["key"]]},
                {"type": "INFO", "yaw": yaw_between(tdef["plan"], s["key"], nxt["key"]) + 140, "pitch": 8, "label": s["name"], "content": s["info"]},
            ]
            if n > 2:
                rows.append({"type": "LINK", "yaw": yaw_between(tdef["plan"], s["key"], prev["key"]), "pitch": -4, "label": prev["name"], "targetSceneId": scene_ids[prev["key"]]})
            for h in rows:
                add(db, Hotspot, tenantId=tid, sceneId=scene_ids[s["key"]], **h)

    db.flush()

    plan_def = PLAN_DEFS[d["plan"]]
    ids = lambda *keys: [broker_by_key[k].id for k in keys if k in broker_by_key]  # noqa: E731
    rules: list[dict] = []
    if plan_def["routingRules"]:
        for r in routing_rule_defs(slug, ids):
            full = {"enabled": True, "requireAvailable": True, "matchLanguage": False, "useTerritory": False, **r}
            obj = add(db, RoutingRule, tenantId=tid, **full)
            rules.append({"id": obj.id, "tenantId": tid, **full})
    db.flush()

    # Leads, routed with the real engine so the audit trails are authentic.
    brokers = [
        {
            "id": b.id, "name": b.name, "active": True, "capacity": b.capacity, "weight": b.weight,
            "languages": b.languages, "areas": b.areas, "territory": b.territory, "workingHours": b.workingHours,
            "timezone": b.timezone, "load": 0, "lastAssignedAt": None,
        }
        for b in broker_by_key.values()
    ]
    broker_rows = {b.id: b for b in broker_by_key.values()}

    total = 56 if slug == "skyline" else 22 if slug == "heritage" else 8
    status_pool = ["NEW", "CONTACTED", "CONTACTED", "VIEWING", "VIEWING", "NEGOTIATION", "WON", "WON", "LOST", "LOST"]
    sources = ["ENQUIRY", "ENQUIRY", "ENQUIRY", "TOUR_BOOKING", "CALLBACK", "CONTACT"]
    lead_plans = []
    for i in range(total):
        age_min = int(rand() * 45 * 24 * 60)
        prop = created[int(rand() * len(created))]
        source = sources[int(rand() * len(sources))]
        language = "Hindi" if rand() < 0.3 else ("Marathi" if rand() < 0.1 else "English")
        name = LEAD_NAMES[(i * 7 + seed_index * 3) % len(LEAD_NAMES)]
        msg = LEAD_MESSAGES[int(rand() * len(LEAD_MESSAGES))]
        lead_plans.append({"ageMin": age_min, "prop": prop, "source": source, "language": language, "name": name, "msg": msg})
    lead_plans.sort(key=lambda lp: -lp["ageMin"])

    with_breach = [
        *lead_plans,
        {"ageMin": 30, "forceNew": True, "prop": created[0], "source": "ENQUIRY", "language": "English", "name": "Rhea Contractor", "msg": "Hi, is a Saturday viewing possible?"},
    ]

    for lp in with_breach:
        created_at = utcnow() - timedelta(minutes=lp["ageMin"])
        if lp.get("forceNew"):
            status = "NEW"
        elif lp["ageMin"] < 2 * 24 * 60 and rand() < 0.6:
            status = "NEW"
        else:
            status = status_pool[int(rand() * len(status_pool))]
        prop = lp["prop"]
        route = route_lead(
            lead={"source": lp["source"], "language": lp["language"], "budget": None},
            property={
                "id": prop["id"], "type": prop["type"], "listingType": prop["listingType"], "price": prop["price"],
                "city": prop["city"], "locality": prop["locality"], "lat": prop["lat"], "lng": prop["lng"],
                "listingBrokerId": prop["listingBrokerId"],
            },
            rules=[dict(r) for r in rules],
            brokers=brokers,
            now=created_at,
            sla_default=tenant.slaMinutes,
        )
        response_min = 3 + int(rand() * 40)
        responded = status != "NEW"
        assigned_at = created_at + timedelta(seconds=1)
        phone = f"+91 9{int(100000000 + rand() * 899999999)}"
        preferred_at = utcnow() + (1 + int(rand() * 6)) * DAY if lp["source"] == "TOUR_BOOKING" else None
        first_response_at = created_at + timedelta(minutes=response_min) if responded else None
        sla_due_at = utcnow() + timedelta(hours=2 + int(rand() * 6)) if status == "NEW" and plan_def["slaAutomation"] else None
        lost_reason = ["Bought elsewhere", "Budget mismatch", "No response", "Changed plans"][int(rand() * 4)] if status == "LOST" else None

        lead = add(
            db,
            Lead,
            tenantId=tid,
            propertyId=prop["id"],
            brokerId=route["brokerId"],
            source=lp["source"],
            name=lp["name"],
            email=re.sub(r"[^a-z]+", ".", lp["name"].lower()) + "@example.com",
            phone=phone,
            message=lp["msg"],
            language=lp["language"],
            preferredAt=preferred_at,
            status=status,
            assignedAt=assigned_at,
            firstResponseAt=first_response_at,
            slaDueAt=sla_due_at,
            lostReason=lost_reason,
            createdAt=created_at,
        )
        db.flush()
        rule = route.get("rule")
        add(
            db,
            Assignment,
            tenantId=tid,
            leadId=lead.id,
            brokerId=route["brokerId"],
            ruleId=rule["id"] if rule else None,
            ruleName=(rule["name"] if rule else None) or ("Default pool" if route.get("fallback") else None),
            strategy=route["strategy"],
            kind="INITIAL",
            reasons=route["reasons"],
            candidates={"candidates": route["candidates"], "trace": route["trace"]},
            createdAt=created_at,
        )
        broker_name = route["broker"]["name"] if route.get("broker") else None
        acts = [
            {"type": "CREATED", "note": f"Lead received via {lp['source'].lower().replace('_', ' ', 1)}", "actor": "System", "createdAt": created_at},
            {"type": "ASSIGNED", "note": f"Auto-assigned to {broker_name or 'nobody'} ({(rule or {}).get('name') or 'default pool'})", "actor": "Routing engine", "createdAt": assigned_at},
        ]
        if responded:
            acts.append({"type": "STATUS", "note": f"Status changed to {status}", "actor": broker_name or "Broker", "createdAt": created_at + timedelta(minutes=response_min)})
        for a in acts:
            add(db, LeadActivity, tenantId=tid, leadId=lead.id, **a)

        b = next((x for x in brokers if x["id"] == route["brokerId"]), None)
        if b:
            b["lastAssignedAt"] = created_at
            if status in OPEN_STATUSES:
                b["load"] += 1
        if route["brokerId"]:
            broker_rows[route["brokerId"]].lastAssignedAt = created_at

    db.flush()

    # The last (NEW, 30 min old) lead breaches its SLA so the worker visibly reassigns it on first run.
    last = db.scalars(
        select(Lead).where(Lead.tenantId == tid, Lead.status == "NEW").order_by(Lead.createdAt.desc()).limit(1)
    ).first()
    if last is not None and slug == "skyline":
        last.slaDueAt = utcnow() - timedelta(minutes=10)
        last.firstResponseAt = None

    print(f"  {d['name']} ({d['plan']}): {len(created)} properties, {len(brokers)} brokers, {len(rules)} rules, {len(with_breach)} leads")


def run(db=None) -> None:
    from app.db import SessionLocal

    print("Seeding demo tenants...")
    password_hash = hash_password(PASSWORD)
    own = db is None
    db = db or SessionLocal()
    try:
        wipe(db)
        for i, t in enumerate(TENANTS):
            seed_tenant(db, t, password_hash, i)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        if own:
            db.close()

    print(f"\nDone. Platform admin: {admin_account()[0]}")
    if demo_users_enabled():
        print(f"Demo logins (password: {PASSWORD})")
        for t in TENANTS:
            print(f"  {t['name'].ljust(16)} {t['owner']['email']}   broker: {BROKERS[t['slug']][0]['email']}")
