# Senso integration — context layer / knowledge base for the GhostDraft chat assistant.
# Ingests clinical documents into a persistent knowledge base and queries them at chat time.
# Falls back silently if SENSO_API_KEY is not configured.
from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv

load_dotenv()

_API_KEY = os.getenv("SENSO_API_KEY", "")
_BASE_URL = "https://api.senso.ai"


# Return True when a Senso API key is present.
def senso_configured() -> bool:
    return bool(_API_KEY and not _API_KEY.startswith("tgr_REPLACE"))


# Query the Senso knowledge base for context relevant to a user prompt.
def query_knowledge_base(prompt: str, top_k: int = 3) -> list[dict[str, Any]]:
    if not senso_configured():
        return []
    try:
        import httpx
        response = httpx.post(
            f"{_BASE_URL}/knowledge/query/",
            headers={
                "Authorization": f"Bearer {_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"query": prompt, "top_k": top_k},
            timeout=5.0,
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("results", data.get("items", []))
        return []
    except Exception as exc:  # noqa: BLE001
        print(f"[Senso] query failed (non-fatal): {exc}")
        return []


# Ingest a clinical document into the Senso knowledge base.
def ingest_document(title: str, content: str, metadata: dict[str, Any] | None = None) -> bool:
    if not senso_configured():
        return False
    try:
        import httpx
        response = httpx.post(
            f"{_BASE_URL}/knowledge/",
            headers={
                "Authorization": f"Bearer {_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "title": title,
                "content": content,
                "metadata": metadata or {},
            },
            timeout=10.0,
        )
        return response.status_code in (200, 201)
    except Exception as exc:  # noqa: BLE001
        print(f"[Senso] ingest failed (non-fatal): {exc}")
        return False


# Build a context-enriched system prompt by prepending relevant KB snippets.
def enrich_system_prompt(base_system: str, user_prompt: str) -> str:
    results = query_knowledge_base(user_prompt, top_k=3)
    if not results:
        return base_system

    snippets: list[str] = []
    for item in results:
        # Handle different response shapes from Senso
        text = (
            item.get("content")
            or item.get("text")
            or item.get("snippet")
            or str(item)
        )
        title = item.get("title", "")
        if text:
            snippets.append(f"[{title}]\n{str(text)[:400]}" if title else str(text)[:400])

    if not snippets:
        return base_system

    context_block = "\n\n---\nRelevant knowledge base context:\n" + "\n\n".join(snippets)
    return base_system + context_block
