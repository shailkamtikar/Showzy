"""Single entry point to Gemini. Locked to gemini-3.5-flash-lite; never falls back to another model."""
import json
import logging
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from ..config import REQUIRED_GEMINI_MODEL, get_settings
from .redact import redact

log = logging.getLogger("showzy.ai")
T = TypeVar("T", bound=BaseModel)


class AIUnavailable(Exception):
    """Quota, network, timeout, missing key: the app continues without AI."""


class AIInvalidOutput(Exception):
    """Model replied but not with schema-valid JSON."""


def _call_model(prompt: str, schema: type[BaseModel]) -> str:
    from google import genai
    from google.genai import types

    s = get_settings()
    if not s.gemini_api_key:
        raise AIUnavailable("GEMINI_API_KEY is not set")
    client = genai.Client(api_key=s.gemini_api_key, http_options=types.HttpOptions(timeout=25_000))
    resp = client.models.generate_content(
        model=REQUIRED_GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0.2,
            max_output_tokens=1800,
        ),
    )
    return resp.text or ""


def generate_structured(prompt: str, schema: type[T], call=_call_model) -> T:
    """Redacts the prompt, calls the model, validates against schema (one retry), else raises."""
    safe = redact(prompt)
    last: Exception | None = None
    for attempt in range(2):
        try:
            raw = call(safe, schema)
        except AIUnavailable:
            raise
        except Exception as e:  # noqa: BLE001  SDK errors: quota, network, timeout
            log.warning("gemini call failed: %s", type(e).__name__)
            raise AIUnavailable(type(e).__name__) from None
        try:
            return schema.model_validate(json.loads(raw))
        except (json.JSONDecodeError, ValidationError) as e:
            last = e
            log.warning("gemini output invalid (attempt %s)", attempt + 1)
    raise AIInvalidOutput(str(last))
