# Datadog LLM Observability integration — traces every LLM call with latency, tokens, status.
# Uses the Datadog HTTP API directly (no agent required) so it works in serverless/cloud envs.
# Falls back silently if DD_API_KEY is not configured.
from __future__ import annotations

import os
import time
import uuid
from typing import Any

from dotenv import load_dotenv

load_dotenv()

_API_KEY = os.getenv("DD_API_KEY", "")
_APP_KEY = os.getenv("DD_APP_KEY", "")
_SITE = os.getenv("DD_SITE", "datadoghq.com")
_SERVICE = "ghostdraft-backend"
_ENV = os.getenv("DD_ENV", "production")


# Return True when a valid Datadog API key is present.
def datadog_configured() -> bool:
    return bool(_API_KEY and len(_API_KEY) == 32)


# Send a single LLM span to Datadog via the Logs intake (lightweight, no agent).
def _send_llm_span(span: dict[str, Any]) -> None:
    if not datadog_configured():
        return
    try:
        import httpx
        url = f"https://http-intake.logs.{_SITE}/api/v2/logs"
        headers = {
            "DD-API-KEY": _API_KEY,
            "Content-Type": "application/json",
        }
        payload = [{
            "ddsource": "ghostdraft",
            "ddtags": f"env:{_ENV},service:{_SERVICE},model:{span.get('model','unknown')}",
            "hostname": "ghostdraft-backend",
            "service": _SERVICE,
            "message": f"LLM call: {span.get('task','unknown')} via {span.get('model','unknown')}",
            **span,
        }]
        httpx.post(url, json=payload, headers=headers, timeout=3.0)
    except Exception as exc:  # noqa: BLE001
        print(f"[Datadog] span send failed (non-fatal): {exc}")


# Send a metric data point to Datadog.
def _send_metric(metric_name: str, value: float, tags: list[str]) -> None:
    if not datadog_configured():
        return
    try:
        import httpx
        url = f"https://api.{_SITE}/api/v2/series"
        headers = {
            "DD-API-KEY": _API_KEY,
            "Content-Type": "application/json",
        }
        payload = {
            "series": [{
                "metric": metric_name,
                "type": 1,  # count
                "points": [{"timestamp": int(time.time()), "value": value}],
                "tags": tags + [f"env:{_ENV}", f"service:{_SERVICE}"],
            }]
        }
        httpx.post(url, json=payload, headers=headers, timeout=3.0)
    except Exception as exc:  # noqa: BLE001
        print(f"[Datadog] metric send failed (non-fatal): {exc}")


class LLMSpan:
    """Context manager that traces one LLM call — records latency, tokens, status."""

    def __init__(self, task: str, model: str, prompt_len: int) -> None:
        # Initialise a new LLM span for the given task and model.
        self.task = task
        self.model = model
        self.prompt_len = prompt_len
        self.span_id = uuid.uuid4().hex
        self._start: float = 0.0
        self.response_len: int = 0
        self.status: str = "ok"
        self.error: str = ""

    def __enter__(self) -> "LLMSpan":
        # Start timing the LLM call.
        self._start = time.perf_counter()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        # Finish timing and ship the span to Datadog.
        latency_ms = (time.perf_counter() - self._start) * 1000
        if exc_type is not None:
            self.status = "error"
            self.error = str(exc_val)[:200]

        span = {
            "span_id": self.span_id,
            "task": self.task,
            "model": self.model,
            "prompt_tokens_approx": self.prompt_len // 4,
            "response_tokens_approx": self.response_len // 4,
            "latency_ms": round(latency_ms, 2),
            "status": self.status,
            "error": self.error,
        }
        _send_llm_span(span)

        # Also send discrete metrics for dashboarding.
        tags = [f"task:{self.task}", f"model:{self.model}", f"status:{self.status}"]
        _send_metric("ghostdraft.llm.calls", 1.0, tags)
        _send_metric("ghostdraft.llm.latency_ms", latency_ms, tags)
        if self.response_len:
            _send_metric("ghostdraft.llm.response_tokens", self.response_len // 4, tags)


# Convenience wrapper — trace a single LLM call and return the response.
def trace_llm_call(
    task: str,
    model: str,
    prompt: str,
    call_fn: Any,
) -> str:
    with LLMSpan(task=task, model=model, prompt_len=len(prompt)) as span:
        result: str = call_fn()
        span.response_len = len(result)
        return result


# Send a privacy event (canary leak, budget exhausted, blocked request) to Datadog.
def send_privacy_event(event_type: str, details: dict[str, Any]) -> None:
    if not datadog_configured():
        return
    try:
        import httpx
        url = f"https://api.{_SITE}/api/v1/events"
        headers = {
            "DD-API-KEY": _API_KEY,
            "Content-Type": "application/json",
        }
        payload = {
            "title": f"GhostDraft privacy event: {event_type}",
            "text": str(details),
            "tags": [f"event_type:{event_type}", f"env:{_ENV}", f"service:{_SERVICE}"],
            "alert_type": "warning" if event_type != "canary_leak" else "error",
        }
        httpx.post(url, json=payload, headers=headers, timeout=3.0)
    except Exception as exc:  # noqa: BLE001
        print(f"[Datadog] event send failed (non-fatal): {exc}")
