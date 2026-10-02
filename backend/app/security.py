import time

import bcrypt
import jwt

from app.config import auth_secret

COOKIE = "re_session"
MAX_AGE = 60 * 60 * 24 * 7


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(10)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user) -> str:
    now = int(time.time())
    payload = {"sub": user.id, "tid": user.tenantId or None, "role": user.role, "name": user.name, "iat": now, "exp": now + MAX_AGE}
    return jwt.encode(payload, auth_secret(), algorithm="HS256")


def read_token(token: str | None):
    if not token:
        return None
    try:
        data = jwt.decode(token, auth_secret(), algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return {"uid": data.get("sub"), "tid": data.get("tid"), "role": data.get("role"), "name": data.get("name")}
