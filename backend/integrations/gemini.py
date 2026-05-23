# Google Gemini (DeepMind) integration — OpenAI-compatible wrapper via google-genai SDK.
# Used when the model selector is set to "gemini-2" or GEMINI_API_KEY is the only key set.
from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv

load_dotenv()

_API_KEY = os.getenv("GEMINI_API_KEY", "")
_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


# Return True when a Gemini API key is present and not a placeholder.
def gemini_configured() -> bool:
    return bool(_API_KEY and not _API_KEY.startswith("REPLACE"))


# Call Gemini via the google-genai SDK and return the text response.
def call_gemini(
    prompt: str,
    system: str,
    *,
    max_tokens: int = 1200,
    json_mode: bool = False,
) -> str:
    if not gemini_configured():
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    try:
        from google import genai  # type: ignore[import]
        from google.genai import types  # type: ignore[import]

        client = genai.Client(api_key=_API_KEY)

        config_kwargs: dict[str, Any] = {
            "max_output_tokens": max_tokens,
            "system_instruction": system,
        }
        if json_mode:
            config_kwargs["response_mime_type"] = "application/json"

        response = client.models.generate_content(
            model=_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(**config_kwargs),
        )
        return response.text or ""

    except ImportError:
        # Fallback: use Gemini via OpenAI-compatible endpoint
        from openai import OpenAI
        client_oa = OpenAI(
            api_key=_API_KEY,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        )
        kwargs: dict[str, Any] = {
            "model": _MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": max_tokens,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        completion = client_oa.chat.completions.create(**kwargs)
        return completion.choices[0].message.content or ""
