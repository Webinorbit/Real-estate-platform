from datetime import datetime, timedelta, timezone

from app.routing.engine import is_broker_available, match_rule, pick_broker, route_lead


def mk(id, **extra):
    base = dict(id=id, name=id, active=True, capacity=5, weight=1, load=0, languages=["English"], areas=[], territory=None,
                workingHours=None, timezone="Asia/Kolkata", lastAssignedAt=None)
    base.update(extra)
    return base


PROPERTY = dict(id="p1", type="VILLA", listingType="SALE", price=50_000_000, city="Mumbai", locality="Juhu", lat=19.1, lng=72.83, listingBrokerId="b3")
LEAD = dict(source="ENQUIRY", language="Hindi", budget=None)


def rule(id, name, priority, conditions=None, strategy="ROUND_ROBIN", brokerIds=None, **extra):
    return dict(id=id, name=name, priority=priority, enabled=True, conditions=conditions or {}, strategy=strategy, brokerIds=brokerIds or [], **extra)


def test_rule_with_matching_conditions_selects_a_broker_using_its_strategy():
    rules = [rule("r1", "Luxury", 1, {"minPrice": 30_000_000}, "LEAST_LOADED", ["b1", "b2"])]
    brokers = [mk("b1", load=3), mk("b2", load=1), mk("b3", load=0)]
    res = route_lead(LEAD, PROPERTY, rules, brokers)
    assert res["brokerId"] == "b2"
    assert res["rule"]["id"] == "r1"
    assert res["fallback"] is False


def test_rules_are_evaluated_by_priority_and_skipped_when_conditions_fail():
    rules = [rule("low", "Low", 20, brokerIds=["b2"]), rule("plots", "Plots", 1, {"propertyTypes": ["PLOT"]}, brokerIds=["b1"])]
    res = route_lead(LEAD, PROPERTY, rules, [mk("b1"), mk("b2")])
    assert res["brokerId"] == "b2"
    assert res["trace"][0]["ruleId"] == "plots"
    assert res["trace"][0]["outcome"] == "skipped"


def test_round_robin_picks_the_broker_who_waited_longest():
    older = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    newer = datetime.now(timezone.utc).isoformat()
    picked = pick_broker("ROUND_ROBIN", [mk("a", lastAssignedAt=newer), mk("b", lastAssignedAt=older), mk("c", lastAssignedAt=newer)])
    assert picked["broker"]["id"] == "b"


def test_round_robin_accepts_naive_database_datetimes():
    old = datetime(2026, 1, 1)
    new = datetime(2026, 6, 1)
    assert pick_broker("ROUND_ROBIN", [mk("a", lastAssignedAt=new), mk("b", lastAssignedAt=old)])["broker"]["id"] == "b"


def test_weighted_strategy_favours_higher_weight_at_equal_load():
    assert pick_broker("WEIGHTED", [mk("a", weight=1, load=2), mk("b", weight=4, load=2)])["broker"]["id"] == "b"


def test_listing_agent_first_falls_back_when_unavailable():
    rules = [rule("r", "Own", 1, strategy="LISTING_AGENT")]
    assert route_lead(LEAD, PROPERTY, rules, [mk("b1"), mk("b3")])["brokerId"] == "b3"
    assert route_lead(LEAD, PROPERTY, rules, [mk("b1"), mk("b3", active=False)])["brokerId"] == "b1"


def test_capacity_language_and_territory_constraints_filter_candidates():
    rules = [rule("r", "Hindi Juhu", 1, matchLanguage=True, useTerritory=True)]
    brokers = [
        mk("full", languages=["Hindi"], areas=["Juhu"], load=5),
        mk("english", languages=["English"], areas=["Juhu"]),
        mk("elsewhere", languages=["Hindi"], areas=["Powai"]),
        mk("ok", languages=["Hindi"], areas=["Juhu"]),
    ]
    assert route_lead(LEAD, PROPERTY, rules, brokers)["brokerId"] == "ok"


def test_territory_polygon_covers_property_coordinates():
    territory = {"type": "Polygon", "coordinates": [[[72.7, 19.0], [72.9, 19.0], [72.9, 19.2], [72.7, 19.2], [72.7, 19.0]]]}
    rules = [rule("r", "Geo", 1, useTerritory=True)]
    assert route_lead(LEAD, PROPERTY, rules, [mk("far"), mk("geo", territory=territory)])["brokerId"] == "geo"


def test_polygon_condition_on_the_rule_itself():
    polygon = {"type": "Polygon", "coordinates": [[[72.8, 19.0], [72.9, 19.0], [72.9, 19.2], [72.8, 19.2], [72.8, 19.0]]]}
    assert match_rule({"conditions": {"polygon": polygon}}, LEAD, PROPERTY)["matched"] is True
    assert match_rule({"conditions": {"polygon": polygon}}, LEAD, {**PROPERTY, "lng": 73.5})["matched"] is False


def test_working_hours_respect_the_broker_timezone():
    wh = {"mon": ["09:00", "18:00"], "tue": ["09:00", "18:00"], "wed": ["09:00", "18:00"], "thu": ["09:00", "18:00"], "fri": ["09:00", "18:00"], "sat": None, "sun": None}
    b = mk("x", workingHours=wh, timezone="Asia/Kolkata")
    assert is_broker_available(b, datetime(2026, 10, 5, 5, 0, tzinfo=timezone.utc)) is True   # Mon 10:30 IST
    assert is_broker_available(b, datetime(2026, 10, 5, 15, 0, tzinfo=timezone.utc)) is False  # Mon 20:30 IST
    assert is_broker_available(b, datetime(2026, 10, 10, 5, 0, tzinfo=timezone.utc)) is False  # Sat


def test_default_pool_is_used_when_no_rule_matches_and_relaxes_availability():
    wh = {d: None for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
    res = route_lead(LEAD, PROPERTY, [], [mk("off", workingHours=wh)])
    assert res["brokerId"] == "off"
    assert res["fallback"] is True
    assert "on-call" in res["reasons"][1]


def test_lead_is_flagged_unassigned_when_there_are_no_active_brokers():
    res = route_lead(LEAD, PROPERTY, [], [mk("x", active=False)])
    assert res["brokerId"] is None
    assert res["unassigned"] is True


def test_excluded_brokers_are_never_repicked_after_an_sla_breach():
    brokers = [mk("a"), mk("b")]
    assert route_lead(LEAD, PROPERTY, [], brokers, exclude_broker_ids=["a"])["brokerId"] == "b"
    assert route_lead(LEAD, PROPERTY, [], brokers, exclude_broker_ids=["a", "b"])["brokerId"] is None


def test_everyone_at_capacity_still_routes_to_the_least_loaded_broker():
    assert route_lead(LEAD, PROPERTY, [], [mk("a", load=9), mk("b", load=6)])["brokerId"] == "b"


def test_empty_working_hours_object_means_every_day_off_like_the_original_engine():
    assert is_broker_available(mk("x", workingHours={}), datetime(2026, 10, 5, 5, 0, tzinfo=timezone.utc)) is False
