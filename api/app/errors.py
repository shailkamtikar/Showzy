class AppError(Exception):
    """Business error rendered as {"error": {"code", "message", "request_id", ...extra}}."""

    def __init__(self, status: int, code: str, message: str, **extra):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra


def not_found(what: str = "Resource") -> AppError:
    return AppError(404, "not_found", f"{what} not found")


def conflict(message: str, **extra) -> AppError:
    return AppError(409, "conflict", message, **extra)


def invalid(message: str, **extra) -> AppError:
    return AppError(422, "invalid_request", message, **extra)
