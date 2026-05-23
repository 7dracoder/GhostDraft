# OpenAI-backed helpers for demo endpoints.
# Supports K2 Think V2 (IFM/MBZUAI) as the primary provider when K2THINK_API_KEY is set,
# falling back to standard OpenAI if OPENAI_API_KEY is a real key.
from __future__ import annotations

import json
import os
from typing import Any

from dotenv import load_dotenv

load_dotenv()

DEFAULT_MODEL = "gpt-4o-mini"
K2THINK_DEFAULT_MODEL = "MBZUAI-IFM/K2-Think-v2"
K2THINK_BASE_URL = "https://api.k2think.ai/v1"
MOCK_KEYS = {"", "sk-REPLACE_ME", "sk-openai-mock"}


# Return True when K2 Think V2 API is configured via K2THINK_API_KEY.
def k2think_configured() -> bool:
    key = os.getenv("K2THINK_API_KEY", "")
    return bool(key and not key.startswith("IFM-REPLACE"))


# Return True when a real OpenAI API key is present (not a mock/placeholder).
def openai_configured() -> bool:
    # K2Think takes priority; treat as "configured" so callers proceed.
    if k2think_configured():
        return True
    key = os.getenv("OPENAI_API_KEY", "")
    return key not in MOCK_KEYS


# Resolve the model name for a given task, preferring K2Think when available.
def model_for(task: str, requested: str | None = None) -> str:
    if k2think_configured():
        return os.getenv("K2THINK_MODEL") or K2THINK_DEFAULT_MODEL
    if task == "chat" and requested == "gpt-5":
        return os.getenv("OPENAI_GPT5_MODEL") or os.getenv("OPENAI_CHAT_MODEL") or "gpt-5"
    env_key = {
        "chat": "OPENAI_CHAT_MODEL",
        "dashboard": "OPENAI_DASHBOARD_MODEL",
        "timeline": "OPENAI_TIMELINE_MODEL",
        "signal": "OPENAI_SIGNAL_MODEL",
    }.get(task, "OPENAI_MODEL")
    return os.getenv(env_key) or os.getenv("OPENAI_MODEL") or DEFAULT_MODEL


# Build an OpenAI-compatible client pointed at K2Think or standard OpenAI.
def _make_client() -> Any:
    from openai import OpenAI

    if k2think_configured():
        return OpenAI(
            api_key=os.environ["K2THINK_API_KEY"],
            base_url=os.getenv("K2THINK_BASE_URL") or K2THINK_BASE_URL,
        )
    return OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def call_openai(
    prompt: str,
    system: str,
    *,
    task: str,
    requested_model: str | None = None,
    max_tokens: int = 1200,
    json_mode: bool = False,
) -> str:
    if not openai_configured():
        raise RuntimeError("No LLM API key configured. Set K2THINK_API_KEY or OPENAI_API_KEY.")

    client = _make_client()
    kwargs: dict[str, Any] = {
        "model": model_for(task, requested_model),
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    # K2Think uses max_tokens; OpenAI newer models use max_completion_tokens.
    try:
        if k2think_configured():
            completion = client.chat.completions.create(max_tokens=max_tokens, **kwargs)
        else:
            completion = client.chat.completions.create(max_completion_tokens=max_tokens, **kwargs)
    except TypeError:
        completion = client.chat.completions.create(max_tokens=max_tokens, **kwargs)
    except Exception as exc:
        if "max_completion_tokens" not in str(exc):
            raise
        completion = client.chat.completions.create(max_tokens=max_tokens, **kwargs)

    choices = getattr(completion, "choices", None)
    if not choices:
        raise RuntimeError("LLM response contained no choices.")
    content = getattr(choices[0].message, "content", None)
    if not content:
        raise RuntimeError("LLM response contained no message content.")
    return content


def extract_json_object(text: str) -> dict[str, Any]:
    start = text.find("{")
    end = text.rfind("}") + 1
    if start < 0 or end <= start:
        raise ValueError("No JSON object found in model output.")
    return json.loads(text[start:end])


# Extract the first JSON object from a model response string.
def extract_json_object(text: str) -> dict[str, Any]:
    start = text.find("{")
    end = text.rfind("}") + 1
    if start < 0 or end <= start:
        raise ValueError("No JSON object found in model output.")
    return json.loads(text[start:end])
