import logging
import threading

from app.config import env

log = logging.getLogger("sla-worker")
_stop = threading.Event()
_thread: threading.Thread | None = None


def _loop(every: float) -> None:
    from app.routing.service import process_sla_breaches_locked

    while not _stop.wait(every):
        try:
            summary = process_sla_breaches_locked()
            if summary and (summary["reassigned"] or summary["escalated"]):
                log.info("[sla-worker] %s", summary)
        except Exception:  # noqa: BLE001
            log.exception("[sla-worker] error")


def start_sla_worker() -> None:
    global _thread
    if env("ENABLE_SLA_WORKER") != "true" or _thread is not None:
        return
    every = float(env("SLA_INTERVAL_SECONDS", "60"))
    _stop.clear()
    _thread = threading.Thread(target=_loop, args=(every,), name="sla-worker", daemon=True)
    _thread.start()
    log.info("[sla-worker] started, every %ss", every)


def stop_sla_worker() -> None:
    global _thread
    _stop.set()
    _thread = None
