from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, headers={"x-tenant-host": "skyline.localhost"})


def test_cities_lists_active_cities_with_centres():
    cities = client.get("/api/public/cities").json()["cities"]
    assert cities and all({"city", "count", "lat", "lng"} <= set(c) for c in cities)
    assert [c["count"] for c in cities] == sorted((c["count"] for c in cities), reverse=True)


def test_search_city_filter_is_exact_and_case_insensitive():
    navi = client.get("/api/properties", params={"city": "navi mumbai", "lt": "SALE"}).json()["items"]
    assert navi and {p["city"] for p in navi} == {"Navi Mumbai"}
    assert client.get("/api/properties", params={"city": "100%_"}).json()["items"] == []


def test_home_follows_city():
    all_home = client.get("/api/public/home").json()
    thane = client.get("/api/public/home", params={"city": "Thane"}).json()
    assert thane["city"] == "Thane" and all_home["city"] == ""
    assert thane["featured"] and {p["city"] for p in thane["featured"]} == {"Thane"}
    assert {t["city"] for t in thane["tiles"]} <= {"Thane"}
    assert all(t["property"]["city"] == "Thane" for t in thane["tours"])
    assert all(p["featured"] for p in all_home["featured"])
    assert thane["stats"] == all_home["stats"]
