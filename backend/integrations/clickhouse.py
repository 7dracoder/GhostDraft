# ClickHouse Cloud integration — persists every audit record to a real analytics DB.
# Falls back silently if ClickHouse is not configured so the app still works offline.
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv

load_dotenv()

_HOST = os.getenv("CLICKHOUSE_HOST", "")
_PORT = int(os.getenv("CLICKHOUSE_PORT", "8443"))
_USER = os.getenv("CLICKHOUSE_USER", "default")
_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "")
_DATABASE = os.getenv("CLICKHOUSE_DATABASE", "default")

# DDL executed once on startup to create the audit_log table if it doesn't exist.
_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS ghostdraft_audit_log (
    request_id   String,
    timestamp    DateTime,
    kind         String,
    route        String,
    model        String,
    entities_count UInt32,
    epsilon_spent  Float64,
    status       String,
    blocked      UInt8,
    prompt_hash  String,
    response_hash String
) ENGINE = MergeTree()
ORDER BY (timestamp, request_id)
"""

_client: Any = None


# Return True when ClickHouse credentials are present in the environment.
def clickhouse_configured() -> bool:
    return bool(_HOST and _PASSWORD)


# Initialise the ClickHouse client and ensure the audit table exists.
def init_clickhouse() -> None:
    global _client
    if not clickhouse_configured():
        return
    try:
        import clickhouse_connect  # type: ignore[import]
        _client = clickhouse_connect.get_client(
            host=_HOST,
            port=_PORT,
            username=_USER,
            password=_PASSWORD,
            database=_DATABASE,
            secure=True,
        )
        _client.command(_CREATE_TABLE_SQL)
    except Exception as exc:  # noqa: BLE001
        print(f"[ClickHouse] init failed (non-fatal): {exc}")
        _client = None


# Insert one audit record into ClickHouse; silently no-ops if not configured or on error.
def insert_audit_record(
    request_id: str,
    kind: str,
    route: str = "",
    model: str = "",
    entities_count: int = 0,
    epsilon_spent: float = 0.0,
    status: str = "ok",
    blocked: bool = False,
    prompt_hash: str = "",
    response_hash: str = "",
) -> None:
    if _client is None:
        return
    try:
        _client.insert(
            "ghostdraft_audit_log",
            [[
                request_id,
                datetime.now(timezone.utc).replace(tzinfo=None),
                kind,
                route,
                model,
                entities_count,
                epsilon_spent,
                status,
                int(blocked),
                prompt_hash,
                response_hash,
            ]],
            column_names=[
                "request_id", "timestamp", "kind", "route", "model",
                "entities_count", "epsilon_spent", "status", "blocked",
                "prompt_hash", "response_hash",
            ],
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[ClickHouse] insert failed (non-fatal): {exc}")


# Query the last N audit records from ClickHouse for the forensic dock.
def query_recent_audit(limit: int = 100) -> list[dict[str, Any]]:
    if _client is None:
        return []
    try:
        result = _client.query(
            f"SELECT * FROM ghostdraft_audit_log ORDER BY timestamp DESC LIMIT {limit}"
        )
        return [dict(zip(result.column_names, row)) for row in result.result_rows]
    except Exception as exc:  # noqa: BLE001
        print(f"[ClickHouse] query failed (non-fatal): {exc}")
        return []


# Return aggregate session stats from ClickHouse.
def query_session_stats() -> dict[str, Any]:
    if _client is None:
        return {}
    try:
        result = _client.query(
            """
            SELECT
                count()                          AS total_requests,
                countIf(blocked = 1)             AS blocked,
                countIf(route = 'local_only')    AS local_only,
                countIf(route != 'local_only' AND blocked = 0) AS proxied,
                sum(epsilon_spent)               AS epsilon_total
            FROM ghostdraft_audit_log
            """
        )
        row = result.result_rows[0] if result.result_rows else (0, 0, 0, 0, 0.0)
        return dict(zip(result.column_names, row))
    except Exception as exc:  # noqa: BLE001
        print(f"[ClickHouse] stats query failed (non-fatal): {exc}")
        return {}
