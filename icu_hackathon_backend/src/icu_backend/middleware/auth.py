import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request as UrlRequest, urlopen

from flask import Request, abort, g


EXEMPT_PATHS = {"/health"}


def _resolve_local_dev_api_key() -> str:
    configured = os.getenv("API_KEY", "").strip()
    if not configured or configured.lower().startswith("your_"):
        return ""
    return configured


def _resolve_local_dev_user_id() -> str:
    configured = os.getenv("LOCAL_API_USER_ID", "").strip()
    return configured or "local-dev-user"


def _is_protected_path(path: str, api_prefix: str) -> bool:
    if path in EXEMPT_PATHS:
        return False

    return path.startswith(api_prefix)


def _hash_api_key(raw_api_key: str) -> str:
    secret = os.getenv("API_KEY_HASH_SECRET", "").strip()
    material = f"{raw_api_key}:{secret}" if secret else raw_api_key
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _load_supabase_credentials() -> tuple[str, str]:
    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    supabase_key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or "").strip()
    return supabase_url, supabase_key


def _fetch_api_key_record(hashed_api_key: str) -> dict | None:
    supabase_url, supabase_key = _load_supabase_credentials()
    if not supabase_url or not supabase_key:
        raise RuntimeError("Supabase API key validation is not configured")

    encoded_hash = quote(hashed_api_key, safe="")
    query_url = (
        f"{supabase_url}/rest/v1/api_keys"
        f"?select=id,user_id,is_active,expires_at,usage_limit"
        f"&api_key=eq.{encoded_hash}&limit=1"
    )

    request = UrlRequest(
        query_url,
        method="GET",
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Accept": "application/json",
        },
    )

    try:
        with urlopen(request, timeout=8) as response:
            payload = response.read().decode("utf-8")
    except HTTPError as error:
        details = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(details or f"Supabase API key lookup failed with status {error.code}") from error
    except URLError as error:
        raise RuntimeError(f"Supabase API key lookup failed: {error.reason}") from error

    rows = json.loads(payload or "[]")
    if not isinstance(rows, list) or not rows:
        return None

    row = rows[0]
    return row if isinstance(row, dict) else None


def _resolve_usage_limit(record: dict) -> int:
    raw_value = record.get("usage_limit")

    try:
        usage_limit = int(raw_value)
    except (TypeError, ValueError):
        raise RuntimeError("Invalid API key usage_limit configuration")

    if usage_limit < 0:
        raise RuntimeError("Invalid API key usage_limit configuration")

    return usage_limit


def _utc_day_window(reference_time: datetime) -> tuple[datetime, datetime]:
    current = reference_time.astimezone(timezone.utc)
    start = current.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start, end


def _count_daily_usage(hashed_api_key: str, reference_time: datetime) -> int:
    supabase_url, supabase_key = _load_supabase_credentials()
    if not supabase_url or not supabase_key:
        raise RuntimeError("Supabase API key validation is not configured")

    start, end = _utc_day_window(reference_time)
    encoded_hash = quote(hashed_api_key, safe="")
    encoded_start = quote(start.isoformat(), safe="")
    encoded_end = quote(end.isoformat(), safe="")

    query_url = (
        f"{supabase_url}/rest/v1/api_usage_logs"
        f"?select=id"
        f"&api_key=eq.{encoded_hash}"
        f"&timestamp=gte.{encoded_start}"
        f"&timestamp=lt.{encoded_end}"
    )

    request = UrlRequest(
        query_url,
        method="HEAD",
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Accept": "application/json",
            "Prefer": "count=exact",
        },
    )

    try:
        with urlopen(request, timeout=8) as response:
            content_range = str(response.headers.get("Content-Range", "")).strip()
    except HTTPError as error:
        details = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(details or f"Supabase usage count failed with status {error.code}") from error
    except URLError as error:
        raise RuntimeError(f"Supabase usage count failed: {error.reason}") from error

    if "/" not in content_range:
        raise RuntimeError("Supabase usage count did not return Content-Range header")

    total_segment = content_range.split("/", maxsplit=1)[1].strip()
    try:
        total_count = int(total_segment)
    except ValueError as error:
        raise RuntimeError("Supabase usage count returned invalid Content-Range header") from error

    return max(0, total_count)


def _insert_usage_log(hashed_api_key: str, endpoint: str, timestamp: datetime) -> None:
    supabase_url, supabase_key = _load_supabase_credentials()
    if not supabase_url or not supabase_key:
        raise RuntimeError("Supabase API key validation is not configured")

    payload = json.dumps(
        {
            "api_key": hashed_api_key,
            "endpoint": str(endpoint or "/").strip() or "/",
            "timestamp": timestamp.astimezone(timezone.utc).isoformat(),
        }
    ).encode("utf-8")

    request = UrlRequest(
        f"{supabase_url}/rest/v1/api_usage_logs",
        method="POST",
        data=payload,
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Prefer": "return=minimal",
        },
    )

    try:
        with urlopen(request, timeout=8):
            return
    except HTTPError as error:
        details = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(details or f"Supabase usage log insert failed with status {error.code}") from error
    except URLError as error:
        raise RuntimeError(f"Supabase usage log insert failed: {error.reason}") from error


def _is_expired(expires_at: str | None) -> bool:
    if not expires_at:
        return False

    raw_value = str(expires_at).strip()
    if not raw_value:
        return False

    try:
        parsed = datetime.fromisoformat(raw_value.replace("Z", "+00:00"))
    except ValueError:
        return True

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed <= datetime.now(timezone.utc)


def enforce_api_key(request: Request, api_prefix: str) -> None:
    if str(request.method or "").upper() == "OPTIONS":
        return

    path = request.path
    if not _is_protected_path(path, api_prefix):
        return

    provided = request.headers.get("X-API-Key", "").strip()
    if not provided:
        abort(401, description="Missing x-api-key header")

    local_dev_api_key = _resolve_local_dev_api_key()
    if local_dev_api_key and provided == local_dev_api_key:
        g.user_id = _resolve_local_dev_user_id()
        g.daily_usage_count = None
        g.api_key_mode = "local-dev"
        return

    hashed_api_key = _hash_api_key(provided)

    try:
        record = _fetch_api_key_record(hashed_api_key)
    except RuntimeError as error:
        abort(500, description=str(error))

    if not record:
        abort(401, description="Invalid API key")

    if not bool(record.get("is_active", False)):
        abort(401, description="Invalid API key")

    if _is_expired(record.get("expires_at")):
        abort(401, description="API key has expired")

    usage_limit = 0
    try:
        usage_limit = _resolve_usage_limit(record)
    except RuntimeError as error:
        abort(500, description=str(error))

    now_utc = datetime.now(timezone.utc)

    try:
        daily_usage_count = _count_daily_usage(hashed_api_key, now_utc)
    except RuntimeError as error:
        abort(500, description=str(error))

    if daily_usage_count >= usage_limit:
        abort(429, description="Daily usage limit exceeded for this API key")

    try:
        _insert_usage_log(hashed_api_key, request.path, now_utc)
    except RuntimeError as error:
        abort(500, description=str(error))

    user_id = str(record.get("user_id") or "").strip()
    if user_id:
        g.user_id = user_id

    g.daily_usage_count = daily_usage_count + 1
