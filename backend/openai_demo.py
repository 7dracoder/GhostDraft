# LLM dispatch layer — routes calls to Gemini (primary), Claude Opus, or OpenAI.
# Wraps every call with Datadog tracing and Senso knowledge-base enrichment.
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


# Return True when any real LLM key is present.
def openai_configured() -> bool:
    from backend.integrations.gemini import gemini_configured
    if gemini_configured():
        return True
    if k2think_configured():
        return True
    key = os.getenv("OPENAI_API_KEY", "")
    return key not in MOCK_KEYS


# Resolve the model name for a given task and optional requested model.
def model_for(task: str, requested: str | None = None) -> str:
    from backend.integrations.gemini import gemini_configured
    # Explicit gemini-2 request — always use Gemini.
    if requested == "gemini-2":
        return os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    # Gemini is primary when configured.
    if gemini_configured():
        return os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    if k2think_configured():
        return os.getenv("K2THINK_MODEL") or K2THINK_DEFAULT_MODEL
    env_key = {
        "chat": "OPENAI_CHAT_MODEL",
        "dashboard": "OPENAI_DASHBOARD_MODEL",
        "timeline": "OPENAI_TIMELINE_MODEL",
        "signal": "OPENAI_SIGNAL_MODEL",
    }.get(task, "OPENAI_MODEL")
    return os.getenv(env_key) or os.getenv("OPENAI_MODEL") or DEFAULT_MODEL


# Build an OpenAI-compatible client pointed at K2Think or standard OpenAI.
def _make_openai_client() -> Any:
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
        raise RuntimeError("No LLM API key configured. Set K2THINK_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY.")

    # Enrich system prompt with Senso knowledge base context.
    from backend.integrations.senso import enrich_system_prompt, senso_configured
    if senso_configured():
        system = enrich_system_prompt(system, prompt)

    resolved_model = model_for(task, requested_model)

    # Datadog tracing wrapper.
    from backend.integrations.datadog import LLMSpan

    # Route to Gemini if it's configured (primary) or explicitly requested.
    from backend.integrations.gemini import call_gemini, gemini_configured
    if gemini_configured() or requested_model == "gemini-2":
        with LLMSpan(task=task, model=resolved_model, prompt_len=len(prompt)) as span:
            result = call_gemini(prompt, system, max_tokens=max_tokens, json_mode=json_mode)
            span.response_len = len(result)
            return result

    # K2Think / OpenAI fallback path.
    client = _make_openai_client()
    kwargs: dict[str, Any] = {
        "model": resolved_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    with LLMSpan(task=task, model=resolved_model, prompt_len=len(prompt)) as span:
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
        span.response_len = len(content)
        return content


# Extract the first JSON object from a model response string.
def extract_json_object(text: str) -> dict[str, Any]:
    start = text.find("{")
    end = text.rfind("}") + 1
    if start < 0 or end <= start:
        raise ValueError("No JSON object found in model output.")
    return json.loads(text[start:end])
