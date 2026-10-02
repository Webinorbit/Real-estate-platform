import html
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import httpx

from app.config import env
from app.plans import PLAN_DEFS

log = logging.getLogger("notify")
_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="notify")


def fire_and_forget(fn, *args, **kwargs) -> None:
    """Runs a notification off the request thread. A mail or webhook failure must never fail a lead."""

    def run():
        try:
            fn(*args, **kwargs)
        except Exception:  # noqa: BLE001
            log.exception("background notification failed")

    _pool.submit(run)


def _e(value) -> str:
    return html.escape(str("" if value is None else value), quote=True)


def send_mail(to: str | None, subject: str, body_html: str, tenant_name: str | None = None) -> dict:
    if not to:
        return {"sent": False, "reason": "no recipient"}
    key = env("RESEND_API_KEY")
    if not key:
        log.info("[mail:dev] to=%s subject=%r", to, subject)
        return {"sent": False, "reason": "RESEND_API_KEY not set (logged only)"}
    mail_from = env("MAIL_FROM") or ""
    sender = mail_from if "<" in mail_from else f"{tenant_name or 'Real Estate'} <{mail_from or 'onboarding@resend.dev'}>"
    try:
        res = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {key}"},
            json={"from": sender, "to": [to], "subject": subject, "html": body_html},
            timeout=8,
        )
        return {"sent": res.is_success}
    except httpx.HTTPError as err:
        log.error("[mail] failed: %s", err)
        return {"sent": False, "reason": str(err)}


def fire_webhook(tenant: dict, event: str, payload: dict) -> None:
    url = tenant.get("webhookUrl")
    if not url or not PLAN_DEFS.get(tenant.get("plan"), PLAN_DEFS["STARTER"])["webhooks"]:
        return
    try:
        httpx.post(
            url,
            headers={"X-Webhook-Event": event},
            json={"event": event, "tenant": tenant.get("slug"), "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "data": payload},
            timeout=6,
        )
    except httpx.HTTPError as err:
        log.error("[webhook] failed: %s", err)


def notify_lead_assigned(tenant: dict, lead: dict, broker: dict | None, property: dict | None, reassigned: bool = False) -> None:
    if not broker:
        return
    where = f" about {_e(property['title'])}" if property else ""
    suffix = f" · {property['title']}" if property else ""
    send_mail(
        broker.get("email"),
        f"{'Reassigned lead' if reassigned else 'New lead'}: {lead['name']}{suffix}",
        f"<p><strong>{_e(lead['name'])}</strong> enquired{where}.</p>\n"
        f"<p>{_e(lead.get('message') or 'No message')}</p>\n"
        f"<p>Phone: {_e(lead.get('phone') or 'n/a')}<br/>Email: {_e(lead['email'])}</p>\n"
        f"<p>Please respond within {tenant['slaMinutes']} minutes to keep the lead.</p>",
        tenant.get("name"),
    )


def notify_escalation(tenant: dict, lead: dict, owner_email: str | None) -> None:
    send_mail(
        owner_email or tenant.get("contactEmail"),
        f"Escalated lead: {lead['name']} has had no response",
        f"<p>Lead <strong>{_e(lead['name'])}</strong> was not answered after repeated reassignments and needs a manual owner.</p>",
        tenant.get("name"),
    )
