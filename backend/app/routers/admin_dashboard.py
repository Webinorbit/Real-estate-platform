"""Admin: dashboard (port of src/app/admin/(panel)/page.js + src/lib/dashboard.js).

Any signed-in staff (OWNER / ADMIN / BROKER; SUPER passes). Anonymous -> 401.
The `?denied` banner in the page is purely a frontend concern.

GET /api/admin/dashboard
    Brokers only see leads (and lead activity) assigned to them; staff see the whole tenant. Window: last 30 days
    versus the 30 days before. Dates in `series` are UTC "YYYY-MM-DD"; timestamps are ISO-8601 'Z' strings.
    -> {
         "kpis": {
           "leads":    {"value": n, "delta": percent change vs previous 30d, "spark": [30 ints]},
           "response": {"value": avg first-response minutes | null, "delta": null, "spark": [30 ints, 0 when no data]},
           "winRate":  {"value": percent, "delta": percentage-point change, "spark": [30 ints = won per day]},
           "listings": {"value": n active listings, "views": total views of active listings}
         },
         "series": [{"date": "YYYY-MM-DD", "leads": n, "won": n, "response": minutes | null}]  (30 days, oldest first),
         "statusCounts": [{"status": NEW|CONTACTED|VIEWING|NEGOTIATION|WON|LOST, "count": n}],
         "sourceCounts": [{"source": ENQUIRY|TOUR_BOOKING|CALLBACK|CONTACT, "count": n}]   (zero counts omitted),
         "leaderboard": [{"id","name","photoUrl","title","capacity","leads","won","open","avgResponse"}]  (staff only, else []),
         "atRisk": [{"id","name","property": title|null,"broker": name|null,"slaDueAt","escalated"}]   (<= 6, NEW leads by SLA deadline),
         "recent": [{"id","type","note","actor","at","leadId","leadName"}]   (<= 8 newest lead activities),
         "topProperties": [{"id","title","views","image": url|null}]   (<= 5 active listings by views),
         -- extras the old page computed from the session (not part of getDashboardData) --
         "isStaff": bool, "firstName": first word of the user's name, "tenantName": str
       }
"""

from fastapi import APIRouter, Depends

from app.dashboard import get_dashboard_data
from app.deps import ANY_STAFF, authed

router = APIRouter(prefix="/api/admin")


@router.get("/dashboard")
def dashboard(ctx=Depends(authed(ANY_STAFF))):
    data = get_dashboard_data(ctx.db, ctx.isStaff, ctx.brokerId)
    return {**data, "isStaff": ctx.isStaff, "firstName": (ctx.user.name.split(" ")[0] if ctx.user.name else ""), "tenantName": ctx.tenant.name}
