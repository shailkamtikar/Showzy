import re

_PATTERNS = [
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[email]"),
    (re.compile(r"eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}"), "[jwt]"),
    (re.compile(r"\b(sb_secret_|sb_publishable_|AQ\.)[\w.-]+"), "[secret]"),
    (re.compile(r"\b\d{9,}\b"), "[number]"),
    (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "[ip]"),
    (re.compile(r"DEMO-[A-Z0-9]{4}-[A-Z0-9]{4}"), "[code]"),
]


def redact(text: str) -> str:
    """Mask emails, tokens, keys, long digit strings, IPs and payment codes before any prompt."""
    for pat, repl in _PATTERNS:
        text = pat.sub(repl, text)
    return text
