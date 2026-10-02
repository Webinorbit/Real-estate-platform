import ipaddress
import socket
from urllib.parse import urlparse

import httpx

from app.errors import UserError
from app.storage import process_image, store_image

MAX_BYTES = 15 * 1024 * 1024


def _is_private(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True
    if getattr(addr, "ipv4_mapped", None):
        addr = addr.ipv4_mapped
    return addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_multicast or addr.is_reserved or addr.is_unspecified


def _assert_public_host(hostname: str) -> None:
    try:
        ipaddress.ip_address(hostname)
        if _is_private(hostname):
            raise UserError("Blocked address")
        return
    except ValueError:
        pass
    try:
        records = socket.getaddrinfo(hostname, None)
    except socket.gaierror as err:
        raise UserError("Could not resolve the image host") from err
    if not records or any(_is_private(r[4][0]) for r in records):
        raise UserError("Blocked address")


def import_remote_image(raw_url: str, tenant_id: str, kind: str = "photo") -> str:
    """Downloads a remote https image (SSRF-guarded), re-encodes it and stores it under the tenant's namespace."""
    url = urlparse(raw_url)
    if url.scheme != "https" or not url.hostname:
        raise UserError("Only https image links are supported")
    _assert_public_host(url.hostname)

    try:
        with httpx.stream("GET", raw_url, follow_redirects=False, timeout=12, headers={"Accept": "image/*"}) as res:
            if not res.is_success:
                raise UserError(f"Image download failed ({res.status_code})")
            if not res.headers.get("content-type", "").startswith("image/"):
                raise UserError("Link is not an image")
            if int(res.headers.get("content-length") or 0) > MAX_BYTES:
                raise UserError("Image is too large")
            chunks, size = [], 0
            for chunk in res.iter_bytes():
                size += len(chunk)
                if size > MAX_BYTES:
                    raise UserError("Image is too large")
                chunks.append(chunk)
    except httpx.HTTPError as err:
        raise UserError("Image download failed") from err

    processed = process_image(b"".join(chunks), kind)
    return store_image(processed["buffer"], processed["ext"], tenant_id, "photos")["url"]
