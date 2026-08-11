#!/usr/bin/env python3
"""
Disease-to-resource matching for the CDC weekly admin portal.

This module is intentionally side-effect free: it reads mapping JSON and returns
link suggestions only. It does not send email, publish pages, or deploy assets.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


DEFAULT_MAPPING_PATH = Path("data/resource_mapping.json")


def load_mapping(path: Path = DEFAULT_MAPPING_PATH) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _contains(text: str, token: str) -> bool:
    return token.lower() in text.lower()


def infer_topics(text: str, mapping: dict[str, Any]) -> list[dict[str, Any]]:
    exact_matches: list[dict[str, Any]] = []
    keyword_matches: list[dict[str, Any]] = []
    for topic in mapping.get("topics", []):
        topic_name = str(topic.get("topic", ""))
        aliases = [str(alias) for alias in topic.get("aliases", [])]
        if topic_name and _contains(text, topic_name):
            exact_matches.append(topic)
            continue
        if any(alias and _contains(text, alias) for alias in aliases):
            keyword_matches.append(topic)
    seen = set()
    ordered: list[dict[str, Any]] = []
    for topic in exact_matches + keyword_matches:
        name = topic.get("topic")
        if name not in seen:
            ordered.append(topic)
            seen.add(name)
    return ordered


def score_resource(text: str, topic_name: str, resource: dict[str, Any]) -> int:
    if not resource.get("enabled", True):
        return -1
    score = 0
    name = str(resource.get("name", ""))
    if topic_name and topic_name in name:
        score += 50
    for keyword in resource.get("keywords", []):
        keyword = str(keyword)
        if keyword and _contains(text, keyword):
            score += 10
    if name and _contains(text, name):
        score += 20
    return score


def choose_resource(kind: str, text: str, topic: dict[str, Any], mapping: dict[str, Any]) -> dict[str, Any]:
    candidates = topic.get(kind, [])
    if not candidates:
        return {}
    ranked = sorted(
        candidates,
        key=lambda item: score_resource(text, str(topic.get("topic", "")), item),
        reverse=True,
    )
    best = ranked[0]
    if score_resource(text, str(topic.get("topic", "")), best) <= 0:
        return {}
    result = dict(best)
    result.update({"matched": "topic", "topic": topic.get("topic", "")})
    return result


def suggest_links(title: str, summary: str, mapping: dict[str, Any] | None = None) -> dict[str, Any]:
    mapping = mapping or load_mapping()
    text = f"{title}\n{summary}"
    topics = infer_topics(text, mapping)
    if not topics:
        fallback_topic = {"topic": "未分類", "education": [], "km": []}
        topics = [fallback_topic]
    primary = topics[0]
    return {
        "topics": [topic.get("topic", "") for topic in topics],
        "transmission": primary.get("transmission", "未分類"),
        "education": choose_resource("education", text, primary, mapping),
        "km": choose_resource("km", text, primary, mapping),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--title", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--mapping", default=str(DEFAULT_MAPPING_PATH))
    args = parser.parse_args()

    mapping = load_mapping(Path(args.mapping))
    print(json.dumps(suggest_links(args.title, args.summary, mapping), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
