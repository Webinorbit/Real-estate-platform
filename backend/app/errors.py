class UserError(Exception):
    """A problem the person using the app can fix. Rendered as a 400 with a readable message."""

    def __init__(self, message: str, status: int = 400, **extra):
        super().__init__(message)
        self.message = message
        self.status = status
        self.extra = extra


class PlanLocked(UserError):
    def __init__(self, feature: str, message: str | None = None):
        super().__init__(message or f"Your current plan does not include {feature}. Upgrade to unlock it.", 403, code="plan_locked", feature=feature)


class Forbidden(UserError):
    def __init__(self, message: str = "Forbidden"):
        super().__init__(message, 403, code="forbidden")


class Unauthorized(UserError):
    def __init__(self, message: str = "Unauthorized"):
        super().__init__(message, 401, code="unauthorized")


class NotFound(UserError):
    def __init__(self, message: str = "Not found"):
        super().__init__(message, 404, code="not_found")
