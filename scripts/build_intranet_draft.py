#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import re
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_PATH = BASE_DIR / "data" / "current_issue.json"
OUTPUT_DIR = BASE_DIR / "output"


def link_text(link: dict | None) -> str:
    if not link or not link.get("url"):
        return ""
    return f"{link.get('name', '連結')}：{link['url']}"


def iter_content_sections(issue: dict):
    for section in issue.get("sections", []):
        if section.get("id") in {"highlights", "internal"}:
            continue
        yield section


def build_plain(issue: dict) -> str:
    lines: list[str] = []
    lines.append(issue.get("subject", "疫情訊息").replace("疫情訊息- ", ""))
    lines.append("")
    lines.append(f"日期：{issue.get('display_date', '')}")
    lines.append("")
    lines.append("本文")
    lines.append("")
    lines.append("疫情概要")
    lines.append("")
    for item in (issue.get("sections", [{}])[0].get("items", []) if issue.get("sections") else []):
        lines.append(f"{item.get('disease', '')}：{item.get('title', '')}")
    lines.append("")

    for section in iter_content_sections(issue):
        for item in section.get("items", []):
            lines.append(item.get("disease") or item.get("title", ""))
            lines.append("")
            if item.get("date"):
                lines.append(f"發佈日期：{item['date']}")
                lines.append("")
            if item.get("summary"):
                lines.append(item["summary"])
            if item.get("audience"):
                lines.append(f"注意對象：{item['audience']}")
            for action in item.get("actions", []):
                lines.append(f"- {action}")
            for detail in item.get("details", []):
                lines.append(detail)
            links = item.get("suggested_links") or {}
            edu = link_text(links.get("education"))
            km = link_text(links.get("km"))
            if km:
                lines.append(f"院內相關措施詳參 KM 系統感染管制手冊「{km}」。")
            if edu:
                lines.append(f"課程參院內 TMS 教育訓練管理系統「{edu}」。")
            if item.get("source_url"):
                lines.append(f"CDC 原文：{item['source_url']}")
            lines.append("")

    for signature in issue.get("signature", ["資料來源：疾病管制署", "~臺大醫院感染管制中心關心您~"]):
        lines.append(signature)
    lines.append("")
    return "\n".join(lines)


def build_html(plain: str) -> str:
    url_pattern = re.compile(r"(https?://[^\s」<]+)")

    def linkify(text: str) -> str:
        escaped = html.escape(text)
        return url_pattern.sub(lambda m: f'<a href="{m.group(1)}" target="_blank" rel="noopener">{m.group(1)}</a>', escaped)

    parts = []
    for block in plain.strip().split("\n\n"):
        safe = linkify(block).replace("\n", "<br>")
        if block.endswith("：") or block in {"本文", "疫情概要"}:
            parts.append(f"<h2>{safe}</h2>")
        else:
            parts.append(f"<p>{safe}</p>")
    body = "\n".join(parts)
    return f"""<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>院內網發文草稿</title>
  <style>
    body {{ font-family: "Microsoft JhengHei", Arial, sans-serif; line-height: 1.8; color: #143c30; max-width: 900px; margin: 32px auto; padding: 0 20px; }}
    h2 {{ font-size: 22px; margin: 28px 0 10px; }}
    p {{ margin: 0 0 16px; }}
  </style>
</head>
<body>
{body}
</body>
</html>
"""


def main() -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    issue = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    plain = build_plain(issue)
    (OUTPUT_DIR / "intranet-post-draft.txt").write_text(plain, encoding="utf-8")
    (OUTPUT_DIR / "intranet-post-draft.html").write_text(build_html(plain), encoding="utf-8")
    print(f"Built {(OUTPUT_DIR / 'intranet-post-draft.txt')}")
    print(f"Built {(OUTPUT_DIR / 'intranet-post-draft.html')}")


if __name__ == "__main__":
    main()
