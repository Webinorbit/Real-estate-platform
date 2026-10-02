# Sales demo script (12 minutes)

Setup: `npm run db:reset`, `npm run dev`, then use Chrome at full-screen. Passwords are `demo1234`. Keep two windows: the public site and `/admin`.

## 1. The buyer's view (4 min) — Skyline Realty, `/`

1. **Hero** — "This is a fully branded site for one client. Everything you see is theirs: logo, colours, fonts, imagery."
2. **Search** — go to **Search**. Drag the map: the list updates live. Click a cluster to zoom. Hover a card to highlight its pin.
3. **Filters** — set price and bedrooms, then **Draw area** and sketch a neighbourhood. Save the search.
4. **Property page** — open a listing: gallery, mortgage calculator, nearby places, similar homes. Favourite it and add two to **Compare**.
5. **Virtual tour** — click **Take the 360° tour**. Move through rooms with the arrows and watch the mini-map cone follow. Open the floor plan view if present. Show share/QR.
6. **Enquiry** — submit the enquiry form on a listing as "Demo Buyer". Keep this moment for step 3.

## 2. The brand switch (1 min)

Visit `/?tenant=heritage`. "Same platform, a different client: different colours, language, currency and listings." Return with `/?tenant=skyline`.

## 3. The broker's view (3 min) — `owner@skyline.demo`

1. **Dashboard** — charts, response time, lead sources.
2. **Leads** — the enquiry from step 1 arrived and was **auto-assigned**. Open it: the timeline shows which rule matched and why.
3. **Pipeline** — drag the lead from New to Contacted.
4. **Routing** — rules list, then the **simulator**: choose a property and source, see who would get the lead and the reasoning. Change the price to cross a band and watch the result change. Open **Audit log**.
5. Mention SLA: "If priya doesn't respond in 15 minutes, it moves to the next broker and finally escalates to the owner."

## 4. Run the business (3 min)

1. **Properties → New** — drop the pin on the map, drag photos in, publish.
2. **Tours → New tour** — upload two panoramas, drop an arrow, publish, open the public link.
3. **Settings** — change the primary colour and show the public site update.
4. **Import** — upload the CSV template, show column mapping, preview and geocoding.

## 5. Plans and multi-tenant (1 min)

Log in as `owner@urbannest.demo` (Starter): Tours and Routing show upgrade prompts. Then `super@webinorbit.demo` → **Clients**: show all tenants, flip a plan, and the **New client** wizard. "Onboarding a new client takes minutes."

## Close

* Their domain and brand live in days.
* They keep their own data.
* Next step: share logo, colours and a sample of listings; we prepare a branded preview.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Map is blank | Check network access to the tile server or set `NEXT_PUBLIC_TILE_URL` |
| Tenant stuck on wrong brand | Visit `/?tenant=` to clear the override |
| Not enough leads on the dashboard | `npm run db:reset` |
| Login locked | Wait 10 minutes (production only) or restart the server |
