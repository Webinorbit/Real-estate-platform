"""Differential test: expected results were produced by running the original zod schema (src/lib/property-schema.js)."""

import json
from pathlib import Path

import pytest

from app.errors import UserError
from app.import_csv import check_row
from app.property_schema import UNDEF as MISSING, Issue, js_number, parse_property_input, validate_property

EXPECTED = json.loads((Path(__file__).parent / "fixtures" / "property_schema_expected.json").read_text())
BASE = dict(title="Nice flat", listingType="SALE", type="APARTMENT", status="ACTIVE", price=100, locality="L", city="C", lat=1, lng=2)


def case(**over):
    d = {**BASE, **over}
    return {k: v for k, v in d.items() if v is not MISSING}


CASES = {
    "notobj": MISSING, "nullin": None,
    "titleMissing": case(title=MISSING), "titleShort": case(title=" ab "), "titleLong": case(title="x" * 141), "titleNum": case(title=5),
    "descNull": case(description=None), "descLong": case(description="x" * 10001), "descNum": case(description=5),
    "lt": case(listingType="X"), "ltMissing": case(listingType=MISSING), "type": case(type="Z"), "status": case(status="Z"),
    "price0": case(price=0), "priceEmpty": case(price=""), "priceUndef": case(price=MISSING), "priceAbc": case(price="abc"),
    "priceBig": case(price=1e13), "priceNull": case(price=None), "priceInf": case(price="Infinity"),
    "bedsFloat": case(beds=2.5), "bedsNeg": case(beds=-1), "bedsBig": case(beds=51), "bedsNegFloat": case(beds=-1.5), "bedsStr": case(beds="x"),
    "bedsNull": case(beds=None), "bedsEmpty": case(beds=""),
    "area": case(areaSqft=-1), "areaBig": case(areaSqft=1e8),
    "yb": case(yearBuilt=1799), "ybHi": case(yearBuilt=2101), "ybF": case(yearBuilt=2000.5), "ybX": case(yearBuilt="x"), "ybEmpty": case(yearBuilt=""),
    "furnLong": case(furnishing="x" * 41), "furnObj": case(furnishing=5), "furnWs": case(furnishing="  "),
    "parking": case(parking=51), "floorBig": case(floor=5001), "floorX": case(floor="x"), "floorNeg": case(floor=-1), "tfF": case(totalFloors=1.5),
    "facingLong": case(facing="x" * 31), "addrLong": case(address="x" * 241),
    "locEmpty": case(locality="  "), "locMissing": case(locality=MISSING), "locLong": case(locality="x" * 81), "cityEmpty": case(city=""),
    "stateLong": case(state="x" * 81), "pcLong": case(postalCode="x" * 13),
    "latHi": case(lat=91), "latMissing": case(lat=MISSING), "latX": case(lat="x"), "latNull": case(lat=None), "lngLo": case(lng=-181),
    "amenStr": case(amenities="x"), "amenNum": case(amenities=[1]), "amenNull": case(amenities=None),
    "imgStr": case(images="x"), "imgNoUrl": case(images=[{"alt": "a"}]), "imgEmptyUrl": case(images=[{"url": ""}]),
    "imgLongUrl": case(images=[{"url": "x" * 601}]), "imgLongAlt": case(images=[{"url": "a", "alt": "x" * 201}]),
    "imgMany": case(images=[{"url": "a"}] * 41), "imgNotObj": case(images=["a"]), "imgAltNull": case(images=[{"url": "a", "alt": None}]),
    "vidLong": case(videoUrl="x" * 401), "brokerLong": case(listingBrokerId="x" * 41),
    "ok": case(featured="false", beds="3", amenities=["Gym", "Foo"], title="  Nice  ", furnishing=" a ", floor="", images=[{"url": "a"}]),
}


def test_every_probed_case_is_covered():
    assert set(CASES) == set(EXPECTED)


@pytest.mark.parametrize("name", sorted(CASES))
def test_matches_zod(name):
    expected = EXPECTED[name]
    try:
        got = validate_property(CASES[name])
    except Issue as issue:
        assert "err" in expected, f"{name}: unexpected issue {issue.message}"
        assert f"{issue.dotted()}|{issue.message}" == expected["err"][0]
    else:
        assert "ok" in expected, f"{name}: expected a failure"
        assert got == expected["ok"]


def test_parse_wording_and_video_rule():
    with pytest.raises(UserError, match="^Title: Give the listing a title$"):
        parse_property_input(case(title="a"))
    with pytest.raises(UserError, match=r"^Images\.0\.url: "):
        parse_property_input(case(images=[{}]))
    with pytest.raises(UserError, match="^Form: Invalid input: expected object, received undefined$"):
        parse_property_input(MISSING)
    with pytest.raises(UserError, match="^Video link must start with https://$"):
        parse_property_input(case(videoUrl="ftp://x"))
    assert parse_property_input(case(videoUrl="HTTP://x"))["videoUrl"] == "HTTP://x"


def test_check_row_is_not_capitalised():
    assert check_row(case(locality=MISSING))["error"] == "locality: Invalid input: expected string, received undefined"
    assert check_row(MISSING)["error"] == "row: Invalid input: expected object, received undefined"
    assert check_row(case())["ok"] is True
    assert check_row(case(lat=None, lng=""))["needsGeocode"] is True and check_row(case(lat=None))["ok"] is True
    assert check_row(case(lat=MISSING))["needsGeocode"] is False


def test_js_number():
    nan = js_number("abc")
    assert nan != nan
    assert js_number("") == 0 and js_number(None) == 0 and js_number(" 12 ") == 12 and js_number("0x10") == 16
    assert js_number(True) == 1 and js_number("1e3") == 1000 and js_number(".5") == 0.5 and js_number("1_0") != js_number("1_0")
