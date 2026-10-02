"""Image processing and storage (local disk or any S3-compatible bucket)."""

import hashlib
import io
import secrets
from pathlib import Path

from PIL import Image, ImageOps

from app.config import env, upload_root
from app.errors import UserError

Image.MAX_IMAGE_PIXELS = 120_000_000

KINDS = {
    "photo": {"max_width": 2400, "format": "webp", "quality": 82},
    "panorama": {"max_width": 6144, "format": "jpeg", "quality": 86},
    "logo": {"max_width": 800, "format": "webp", "quality": 90},
    "plan": {"max_width": 2400, "format": "webp", "quality": 90},
}

MIME = {"webp": "image/webp", "jpeg": "image/jpeg", "jpg": "image/jpeg", "png": "image/png", "svg": "image/svg+xml", "avif": "image/avif", "gif": "image/gif"}


def mime_for(filename: str) -> str:
    return MIME.get(Path(filename).suffix[1:].lower(), "application/octet-stream")


def _open(data: bytes) -> Image.Image:
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as err:  # noqa: BLE001  (Pillow raises many unrelated types for bad input)
        raise UserError("That file is not a valid image") from err
    return ImageOps.exif_transpose(img)


def process_image(data: bytes, kind: str) -> dict:
    """Re-encodes uploads (strips metadata, caps size) so raw user files are never served."""
    cfg = KINDS.get(kind, KINDS["photo"])
    img = _open(data)
    if not img.width or not img.height:
        raise UserError("That file is not a valid image")
    if img.width > cfg["max_width"]:
        img = img.resize((cfg["max_width"], round(img.height * cfg["max_width"] / img.width)), Image.LANCZOS)

    out = io.BytesIO()
    if cfg["format"] == "jpeg":
        img.convert("RGB").save(out, "JPEG", quality=cfg["quality"], optimize=True, progressive=True)
        ext = "jpg"
    else:
        img.save(out, "WEBP", quality=cfg["quality"])
        ext = "webp"
    return {"buffer": out.getvalue(), "ext": ext, "width": img.width, "height": img.height}


def panorama_thumb(data: bytes) -> dict:
    """Centre crop of an equirectangular panorama so cards show a natural-looking view instead of a stretched strip."""
    img = _open(data)
    w = round(img.width * 0.34)
    h = min(img.height, round(w * 0.7))
    left, top = round((img.width - w) / 2), round((img.height - h) / 2)
    crop = img.crop((left, top, left + w, top + h))
    crop = crop.resize((640, max(1, round(crop.height * 640 / crop.width))), Image.LANCZOS)
    out = io.BytesIO()
    crop.convert("RGB").save(out, "WEBP", quality=78)
    return {"buffer": out.getvalue(), "ext": "webp"}


_s3_client = None


def _s3():
    global _s3_client
    if _s3_client is None:
        import boto3
        from botocore.config import Config

        _s3_client = boto3.client(
            "s3",
            region_name=env("S3_REGION", "auto"),
            endpoint_url=env("S3_ENDPOINT"),
            aws_access_key_id=env("S3_ACCESS_KEY_ID"),
            aws_secret_access_key=env("S3_SECRET_ACCESS_KEY"),
            config=Config(s3={"addressing_style": "path" if env("S3_FORCE_PATH_STYLE") == "true" else "auto"}),
        )
    return _s3_client


def store_image(buffer: bytes, ext: str, tenant_id: str, folder: str = "misc") -> dict:
    """Stores a processed image and returns its public URL. Keys are namespaced by tenant."""
    digest = hashlib.sha1(buffer).hexdigest()[:12]
    name = f"{digest}-{secrets.token_hex(3)}.{ext}"
    key = f"{tenant_id}/{folder}/{name}"

    if env("STORAGE_DRIVER") == "s3":
        _s3().put_object(Bucket=env("S3_BUCKET"), Key=key, Body=buffer, ContentType=mime_for(name), CacheControl="public, max-age=31536000, immutable")
        base = (env("S3_PUBLIC_URL") or "").rstrip("/")
        return {"url": f"{base}/{key}", "key": key}

    full = upload_root() / key
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_bytes(buffer)
    return {"url": f"/uploads/{key}", "key": key}


def read_local(segments: list[str]) -> bytes | None:
    root = upload_root()
    full = root.joinpath(*segments).resolve()
    if root not in full.parents:
        return None
    try:
        return full.read_bytes()
    except OSError:
        return None
