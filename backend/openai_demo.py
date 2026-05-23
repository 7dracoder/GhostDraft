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


# Strip chain-of-thought reasoning blocks from model output.
# Reasoning models (K2Think, o1, etc.) wrap internal thinking in <think>...</think>.
# K2Think sometimes omits the opening tag — strip everything before </think> in that case.
def _strip_reasoning(text: str) -> str:
    import re
    # Case 1: full <think>...</think> block present — remove it.
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    # Case 2: closing </think> present without opening tag — everything before it is reasoning.
    if "</think>" in cleaned:
        cleaned = cleaned.split("</think>", 1)[-1]
    return cleaned.strip()


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
    # Falls back to K2Think/OpenAI on rate limit or any Gemini error.
    from backend.integrations.gemini import call_gemini, gemini_configured
    if gemini_configured() or requested_model == "gemini-2":
        try:
            with LLMSpan(task=task, model=resolved_model, prompt_len=len(prompt)) as span:
                # Gemini free tier doesn't support json_mode reliably — ask for JSON in prompt instead.
                result = call_gemini(prompt, system, max_tokens=max_tokens, json_mode=False)
                span.response_len = len(result)
                return result
        except Exception as exc:
            err_str = str(exc).lower()
            # On rate limit or quota exhaustion, fall through to K2Think/OpenAI.
            if any(kw in err_str for kw in ("429", "quota", "rate", "exhausted", "resource_exhausted")):
                print(f"[Gemini] rate limited, falling back to K2Think: {exc}")
            elif requested_model == "gemini-2":
                # Explicit gemini-2 request — don't silently fall back, re-raise.
                raise
            else:
                print(f"[Gemini] error, falling back to K2Think: {exc}")

    # K2Think / OpenAI fallback path.
    # Always use the correct K2Think model name regardless of what was requested.
    k2think_model = os.getenv("K2THINK_MODEL") or K2THINK_DEFAULT_MODEL
    client = _make_openai_client()
    kwargs: dict[str, Any] = {
        "model": k2think_model if k2think_configured() else resolved_model,
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
        # Strip chain-of-thought reasoning block emitted by reasoning models (e.g. K2Think).
        # Everything inside <think>...</think> is internal reasoning — only the text after is the answer.
        content = _strip_reasoning(content)
        span.response_len = len(content)
        return content


# Extract the first JSON object from a model response string.
def extract_json_object(text: str) -> dict[str, Any]:
    start = text.find("{")
    end = text.rfind("}") + 1
    if start < 0 or end <= start:
        raise ValueError("No JSON object found in model output.")
    return json.loads(text[start:end])
