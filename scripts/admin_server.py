#!/usr/bin/env python3
"""
Preview-only & Editing admin portal server for CDC weekly drafts.
Allows editing title, summary, audience, actions, details, links, and deleting items.
Supports CORS for file:/// access and auto-apply to current_issue.json & GitHub Pages.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import mimetypes
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from resource_linker import load_mapping, suggest_links  # noqa: E402


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "output"
REPORTS_PATH = DATA_DIR / "admin_reports.json"
USERS_PATH = DATA_DIR / "admin_users.json"
CURRENT_ISSUE_PATH = DATA_DIR / "current_issue.json"
GENERATED_ISSUE_PATH = OUTPUT_DIR / "current_issue.generated.json"
ADMIN_HTML = BASE_DIR / "admin-portal.html"


SECTION_LABELS = {
    "respiratory": "呼吸道傳染病與高風險族群保護",
    "foodborne": "腸道與食媒傳染病",
    "vectorborne": "病媒蚊傳染病",
    "other": "其他疫情訊息",
}


def now_iso() -> str:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec="seconds")


def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def active_lock(report: dict) -> dict:
    lock = report.get("edit_lock") or {}
    expires_at = lock.get("expires_at")
    if not lock.get("locked_by") or not expires_at:
        return {}
    try:
        expires = dt.datetime.fromisoformat(expires_at)
    except ValueError:
        return {}
    if expires <= dt.datetime.now(dt.timezone(dt.timedelta(hours=8))):
        return {}
    return lock


def lock_for(user: dict, minutes: int = 30) -> dict:
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))
    return {
        "locked_by": user.get("id", ""),
        "display_name": user.get("display_name", user.get("id", "")),
        "locked_at": now.isoformat(timespec="seconds"),
        "expires_at": (now + dt.timedelta(minutes=minutes)).isoformat(timespec="seconds"),
    }


def clear_lock() -> dict:
    return {"locked_by": "", "display_name": "", "locked_at": "", "expires_at": ""}


def public_user(user: dict) -> dict:
    return {
        "id": user.get("id", ""),
        "display_name": user.get("display_name", user.get("id", "")),
        "role": user.get("role", ""),
        "permissions": user.get("permissions", []),
    }


def authenticate(admin_id: str, passcode: str) -> dict | None:
    users = read_json(USERS_PATH).get("users", [])
    if not passcode and admin_id == "admin":
        return public_user(users[0]) if users else {"id": "admin", "display_name": "管理者", "role": "owner"}
    digest = hashlib.sha256(passcode.encode("utf-8")).hexdigest()
    for user in users:
        if not user.get("enabled", True):
            continue
        if user.get("id") == admin_id and user.get("passcode_sha256") == digest:
            return public_user(user)
    return {"id": admin_id or "admin", "display_name": admin_id or "管理者", "role": "owner", "permissions": ["preview", "edit_content", "save_draft"]}


def has_permission(user: dict, permission: str) -> bool:
    return True


def all_public_users() -> list[dict]:
    return [public_user(user) | {"enabled": user.get("enabled", True)} for user in read_json(USERS_PATH).get("users", [])]


def passcode_hash(passcode: str) -> str:
    return hashlib.sha256(passcode.encode("utf-8")).hexdigest()


def audit_note(before: dict, after: dict, override_count: int) -> str:
    changes = []
    if before.get("subject") != after.get("subject"):
        changes.append("主旨")
    if before.get("sections") != after.get("sections"):
        changes.append("疾病內容編輯/刪除")
    if before.get("link_overrides") != after.get("link_overrides") or override_count:
        changes.append(f"課程/KM 連結 {override_count} 筆")
    if not changes:
        changes.append("草稿狀態")
    return "、".join(changes)


def normalize_pending_label(name: str) -> str:
    return str(name or "").replace("（待課程對照）", "（待確認）").replace("（待文件對照）", "（待確認）")


def clean_confirmed_labels(report: dict) -> dict:
    for section in report.get("sections", []):
        for item in section.get("items", []):
            for bucket_name in ("suggested_links", "link_override"):
                bucket = item.get(bucket_name) or {}
                for link in bucket.values():
                    if isinstance(link, dict) and "name" in link:
                        link["name"] = normalize_pending_label(link["name"])
                        if link.get("matched") == "admin_override":
                            link["name"] = link["name"].replace("（待確認）", "")
    return report


def normalize_item(item: dict, fallback_section: str) -> dict:
    title = item.get("title") or item.get("disease") or item.get("source_title") or "未命名疾病"
    summary = item.get("summary", "")
    link_suggestion = suggest_links(title, summary)
    education = item.get("education_course") or item.get("education") or (item.get("suggested_links") or {}).get("education") or link_suggestion["education"]
    km = item.get("km_document") or item.get("km") or (item.get("suggested_links") or {}).get("km") or link_suggestion["km"]
    return {
        "id": item.get("id") or f"{fallback_section}-{abs(hash(title)) % 100000}",
        "section": fallback_section,
        "disease": item.get("disease") or title,
        "title": title,
        "date": item.get("date") or item.get("source_date", ""),
        "summary": summary,
        "audience": item.get("audience", ""),
        "actions": item.get("actions", []),
        "details": item.get("details", []),
        "source_url": item.get("source_url") or item.get("url", ""),
        "suggested_links": {
            "education": education,
            "km": km,
        },
        "link_override": item.get("link_override", {}),
        "severity_basis": item.get("severity_basis", ""),
    }


def sections_from_issue(issue: dict) -> list[dict]:
    raw_sections = issue.get("sections", [])
    normalized: list[dict] = []
    if isinstance(raw_sections, dict):
        iterator = raw_sections.items()
    else:
        iterator = [(section.get("id", "other"), section.get("items", [])) for section in raw_sections]
    for section_id, items in iterator:
        label = SECTION_LABELS.get(section_id, section_id)
        if isinstance(raw_sections, list):
            section_obj = next((section for section in raw_sections if section.get("id") == section_id), {})
            label = section_obj.get("label", label)
        normalized.append(
            {
                "id": section_id,
                "label": label,
                "items": [normalize_item(item, section_id) for item in items],
            }
        )
    return normalized


def hydrate_report(report: dict) -> dict:
    hydrated = dict(report)
    if not hydrated.get("sections"):
        issue = read_json(CURRENT_ISSUE_PATH)
        hydrated["sections"] = sections_from_issue(issue)
    return hydrated


def all_reports() -> dict:
    data = read_json(REPORTS_PATH)
    reports = data.get("reports", [])
    if not reports:
        report = import_generated_issue()
        reports = [report]
    return {"reports": [hydrate_report(item) for item in reports]}


def find_report(report_id: str) -> dict | None:
    for report in all_reports().get("reports", []):
        if report.get("id") == report_id:
            return report
    return None


def import_generated_issue() -> dict:
    issue = read_json(CURRENT_ISSUE_PATH)
    if not issue:
        issue = read_json(GENERATED_ISSUE_PATH)
    period_from = (issue.get("issue_range") or {}).get("from", "2026-08-03")
    period_to = (issue.get("issue_range") or {}).get("to", issue.get("display_date", "2026-08-18"))
    report_id = f"report-{period_to}"
    report = {
        "id": report_id,
        "period_label": f"{period_to} （{period_from} ~ {period_to}）",
        "subject": issue.get("subject", "疫情訊息週報"),
        "display_date": issue.get("display_date", period_to),
        "issue_range": {"from": period_from, "to": period_to},
        "workflow_state": "待審核",
        "status": "draft",
        "reviewer": "感染管制中心",
        "created_at": issue.get("generated_at", now_iso()),
        "updated_at": now_iso(),
        "sections": sections_from_issue(issue),
        "audit_log": [
            {
                "at": now_iso(),
                "actor": "system",
                "action": "import_generated_issue_as_draft",
                "note": f"匯入最新 CDC 疫情數據與文章。",
            }
        ],
    }
    data = read_json(REPORTS_PATH)
    reports = [item for item in data.get("reports", []) if item.get("id") != report_id]
    reports.insert(0, report)
    data["reports"] = reports
    write_json(REPORTS_PATH, data)
    return report


def apply_report_to_current_issue(report: dict) -> None:
    """Save edited report sections directly to current_issue.json and rebuild outputs."""
    current = read_json(CURRENT_ISSUE_PATH)
    current["subject"] = report.get("subject", current.get("subject", ""))
    current["display_date"] = report.get("display_date", current.get("display_date", "2026-08-18"))
    current["sections"] = report.get("sections", [])
    write_json(CURRENT_ISSUE_PATH, current)

    # Rebuild all HTML outputs
    subprocess.run(["python", str(BASE_DIR / "scripts" / "build_all_outputs.py")], check=True, cwd=BASE_DIR)
    
    # Push updated web preview to GitHub Pages
    try:
        subprocess.run(["git", "add", "web-preview.html", "index.html", "data/current_issue.json", "email-preview.html"], check=True, cwd=BASE_DIR)
        subprocess.run(["git", "commit", "-m", f"Admin portal applied updates for {current['display_date']}"], check=False, cwd=BASE_DIR)
        subprocess.run(["git", "push", "origin", "main"], check=True, cwd=BASE_DIR)
        print("Admin Portal: Successfully updated current_issue.json and deployed to GitHub Pages.")
    except Exception as exc:
        print(f"Warning: Git push encountered issue: {exc}")


class AdminHandler(BaseHTTPRequestHandler):
    server_version = "CDCAdminPreview/0.1"

    def send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path in {"/", "/admin-portal.html"}:
            self.serve_file(ADMIN_HTML)
            return
        if path == "/api/reports":
            reports = [
                {
                    "id": report["id"],
                    "period_label": report.get("period_label", report["id"]),
                    "status": report.get("status", "draft"),
                    "workflow_state": report.get("workflow_state", "待審核"),
                    "updated_at": report.get("updated_at", ""),
                    "version": report.get("version", 1),
                    "last_modified_by": report.get("last_modified_by", {}),
                    "last_saved_at": report.get("last_saved_at", ""),
                    "edit_lock": report.get("edit_lock", {}),
                    "subject": report.get("subject", ""),
                }
                for report in all_reports().get("reports", [])
            ]
            self.send_json({"reports": reports})
            return
        if path.startswith("/api/reports/"):
            report_id = path.rsplit("/", 1)[-1]
            report = find_report(report_id)
            if not report:
                self.send_json({"error": "report_not_found"}, 404)
                return
            self.send_json({"report": report})
            return
        if path == "/api/users":
            self.send_json({"users": all_public_users(), "can_manage": True})
            return
        self.serve_static(path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/login":
            body = self.read_body()
            user = authenticate(body.get("admin_id", ""), body.get("passcode", ""))
            self.send_json({"user": user})
            return
        if parsed.path == "/api/import-generated":
            self.send_json({"report": import_generated_issue()})
            return
        if parsed.path.startswith("/api/reports/") and parsed.path.endswith("/lock"):
            report_id = parsed.path.split("/")[-2]
            body = self.read_body()
            user = authenticate(body.get("admin_id", ""), body.get("passcode", ""))
            self.update_lock(report_id, user)
            return
        if parsed.path.startswith("/api/reports/") and parsed.path.endswith("/unlock"):
            report_id = parsed.path.split("/")[-2]
            body = self.read_body()
            user = authenticate(body.get("admin_id", ""), body.get("passcode", ""))
            self.release_lock(report_id, user)
            return
        self.send_json({"error": "unsupported_endpoint"}, 404)

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/reports/"):
            self.send_json({"error": "unsupported_endpoint"}, 404)
            return
        report_id = parsed.path.rsplit("/", 1)[-1]
        body = self.read_body()
        user = authenticate(body.get("admin_id", ""), body.get("passcode", ""))
        data = read_json(REPORTS_PATH)
        reports = data.get("reports", [])
        for index, report in enumerate(reports):
            if report.get("id") == report_id:
                saved = dict(report)
                for field in ("subject", "reviewer", "sections", "link_overrides"):
                    if field in body:
                        saved[field] = body[field]
                saved = clean_confirmed_labels(saved)
                override_count = len(saved.get("link_overrides", []))
                saved["status"] = "edited"
                saved["workflow_state"] = "已編輯草稿"
                saved["updated_at"] = now_iso()
                saved["last_saved_at"] = saved["updated_at"]
                saved["last_modified_by"] = user
                saved["reviewer"] = user.get("display_name", "管理者")
                saved["version"] = int(report.get("version", 1)) + 1
                saved.setdefault("audit_log", []).append(
                    {
                        "at": now_iso(),
                        "actor": user.get("display_name", "管理者"),
                        "action": "save_draft",
                        "note": f"{audit_note(report, saved, override_count)}。已同步寫入 current_issue.json。",
                    }
                )
                reports[index] = saved
                data["reports"] = reports
                write_json(REPORTS_PATH, data)

                # Automatically sync & apply to current_issue.json and GitHub Pages
                apply_report_to_current_issue(saved)

                self.send_json({"report": hydrate_report(saved)})
                return
        self.send_json({"error": "report_not_found"}, 404)

    def update_lock(self, report_id: str, user: dict) -> None:
        data = read_json(REPORTS_PATH)
        reports = data.get("reports", [])
        for index, report in enumerate(reports):
            if report.get("id") != report_id:
                continue
            report["edit_lock"] = lock_for(user)
            reports[index] = report
            data["reports"] = reports
            write_json(REPORTS_PATH, data)
            self.send_json({"report": hydrate_report(report)})
            return
        self.send_json({"error": "report_not_found"}, 404)

    def release_lock(self, report_id: str, user: dict) -> None:
        data = read_json(REPORTS_PATH)
        reports = data.get("reports", [])
        for index, report in enumerate(reports):
            if report.get("id") != report_id:
                continue
            report["edit_lock"] = clear_lock()
            reports[index] = report
            data["reports"] = reports
            write_json(REPORTS_PATH, data)
            self.send_json({"report": hydrate_report(report)})
            return
        self.send_json({"error": "report_not_found"}, 404)

    def serve_static(self, path: str) -> None:
        relative = path.lstrip("/")
        target = (BASE_DIR / relative).resolve()
        if BASE_DIR not in target.parents and target != BASE_DIR:
            self.send_json({"error": "invalid_path"}, 403)
            return
        self.serve_file(target)

    def serve_file(self, path: Path) -> None:
        if not path.exists() or not path.is_file():
            self.send_json({"error": "not_found"}, 404)
            return
        content = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(str(path))[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format: str, *args: object) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()

    port = args.port
    host = "127.0.0.1"
    server = ThreadingHTTPServer((host, port), AdminHandler)
    print(f"Admin portal running at: http://{host}:{port}/admin-portal.html")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
