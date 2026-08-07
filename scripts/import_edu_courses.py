#!/usr/bin/env python3
"""Convert an exported education course list CSV into data/edu_courses.json."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


FALLBACK = {
    "name": "臺大醫院教育訓練管理系統",
    "url": "https://edu.ntuh.gov.tw/index/login?next=%2F",
}


def split_terms(value: str) -> list[str]:
    return [item.strip() for item in value.replace(",", ";").split(";") if item.strip()]


def truthy(value: str) -> bool:
    return value.strip().lower() not in {"false", "0", "no", "n", "停用"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default="data/edu_courses_template.csv", help="CSV file exported/copied from education course inventory.")
    parser.add_argument("--out", default="data/edu_courses.json")
    args = parser.parse_args()

    rows = []
    with Path(args.csv).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            name = (row.get("課程名稱") or row.get("name") or "").strip()
            url = (row.get("完整連結") or row.get("url") or "").strip()
            if not name or not url:
                continue
            rows.append(
                {
                    "name": name,
                    "url": url,
                    "keywords": split_terms(row.get("關鍵字") or row.get("keywords") or ""),
                    "aliases": split_terms(row.get("別名") or row.get("aliases") or ""),
                    "enabled": truthy(row.get("啟用") or row.get("enabled") or "TRUE"),
                }
            )

    output = {"fallback": FALLBACK, "courses": rows}
    Path(args.out).write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(rows)} education course mappings to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
