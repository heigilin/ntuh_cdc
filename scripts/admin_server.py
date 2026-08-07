#!/usr/bin/env python3
"""
Preview-only admin portal server for CDC weekly drafts.

Allowed behavior:
- read generated CDC draft data
- suggest resource links
- save local JSON draft edits

Forbidden by design:
- no email sending endpoint
- no website publishing endpoint
- no SharePoint deployment endpoint
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import mimetypes
import os
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
    digest = hashlib.sha256(passcode.encode("utf-8")).hexdigest()
    for user in users:
        if not user.get("enabled", True):
            continue
        if user.get("id") == admin_id and user.get("passcode_sha256") == digest:
            return public_user(user)
    return None


def require_owner(body: dict) -> dict | None:
    user = authenticate(body.get("admin_id", ""), body.get("passcode", ""))
    if not user or user.get("role") != "owner":
        return None
    return user


def has_permission(user: dict, permission: str) -> bool:
    return user.get("role") == "owner" or permission in user.get("permissions", [])


def all_public_users() -> list[dict]:
    return [public_user(user) | {"enabled": user.get("enabled", True)} for user in read_json(USERS_PATH).get("users", [])]


def passcode_hash(passcode: str) -> str:
    return hashlib.sha256(passcode.encode("utf-8")).hexdigest()


def upsert_admin_user(actor: dict, incoming: dict) -> dict:
    data = read_json(USERS_PATH)
    data.setdefault("users", [])
    admin_id = str(incoming.get("id", "")).strip()
    if not admin_id:
        raise ValueError("missing_admin_id")
    permissions = incoming.get("permissions") or ["preview", "edit_content", "override_links", "save_draft"]
    clean_user = {
        "id": admin_id,
        "display_name": str(incoming.get("display_name") or admin_id).strip(),
        "role": str(incoming.get("role") or "editor").strip(),
        "enabled": bool(incoming.get("enabled", True)),
        "permissions": permissions,
    }
    if incoming.get("passcode"):
        clean_user["passcode_sha256"] = passcode_hash(str(incoming["passcode"]))
    users = data["users"]
    for index, user in enumerate(users):
        if user.get("id") == admin_id:
            if "passcode_sha256" not in clean_user:
                clean_user["passcode_sha256"] = user.get("passcode_sha256", "")
            users[index] = clean_user
            break
    else:
        if "passcode_sha256" not in clean_user:
            raise ValueError("missing_passcode_for_new_user")
        users.append(clean_user)
    data["updated_at"] = now_iso()
    data["updated_by"] = actor["display_name"]
    write_json(USERS_PATH, data)
    return public_user(clean_user) | {"enabled": clean_user["enabled"]}


def audit_note(before: dict, after: dict, override_count: int) -> str:
    changes = []
    if before.get("subject") != after.get("subject"):
        changes.append("主旨")
    if before.get("sections") != after.get("sections"):
        changes.append("疾病內文")
    if before.get("link_overrides") != after.get("link_overrides") or override_count:
        changes.append(f"課程/KM 連結覆寫 {override_count} 筆")
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
    for row in report.get("link_overrides", []):
        for link in (row.get("links") or {}).values():
            if isinstance(link, dict) and "name" in link:
                link["name"] = normalize_pending_label(link["name"])
                if link.get("matched") == "admin_override":
                    link["name"] = link["name"].replace("（待確認）", "")
    return report


def normalize_item(item: dict, fallback_section: str) -> dict:
    title = item.get("title") or item.get("disease") or item.get("source_title") or "未命名疾病"
    summary = item.get("summary", "")
    link_suggestion = suggest_links(title, summary)
    education = item.get("education_course") or item.get("education") or link_suggestion["education"]
    km = item.get("km_document") or item.get("km") or link_suggestion["km"]
    return {
        "id": item.get("id") or f"{fallback_section}-{abs(hash(title)) % 100000}",
        "section": fallback_section,
        "disease": item.get("disease") or title,
        "title": title,
        "date": item.get("date") or item.get("source_date", ""),
        "summary": summary,
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
    hydrated.setdefault("link_overrides", [])
    hydrated.setdefault("audit_log", [])
    hydrated.setdefault("status", "draft")
    hydrated.setdefault("workflow_state", "待審核")
    hydrated.setdefault("version", 1)
    hydrated.setdefault("last_modified_by", {"id": "", "display_name": ""})
    hydrated.setdefault("last_saved_at", hydrated.get("updated_at", ""))
    hydrated.setdefault("edit_lock", clear_lock())
    if not active_lock(hydrated):
        hydrated["edit_lock"] = clear_lock()
    return hydrated


def all_reports() -> dict:
    data = read_json(REPORTS_PATH)
    data.setdefault("reports", [])
    data["reports"] = [hydrate_report(report) for report in data["reports"]]
    return data


def find_report(report_id: str) -> dict | None:
    for report in all_reports().get("reports", []):
        if report.get("id") == report_id:
            return report
    return None


def flatten_resources() -> list[dict]:
    mapping = load_mapping(BASE_DIR / "data" / "resource_mapping.json")
    resources: list[dict] = []
    for kind in ("education", "km"):
        fallback = dict(mapping["fallbacks"][kind])
        fallback.update({"kind": kind, "topic": "fallback", "matched": "fallback"})
        resources.append(fallback)
    for topic in mapping.get("topics", []):
        for kind in ("education", "km"):
            for resource in topic.get(kind, []):
                if resource.get("enabled", True):
                    item = dict(resource)
                    item.update({"kind": kind, "topic": topic.get("topic", "")})
                    resources.append(item)
    return resources


def import_generated_issue() -> dict:
    source = GENERATED_ISSUE_PATH if GENERATED_ISSUE_PATH.exists() else CURRENT_ISSUE_PATH
    issue = read_json(source)
    today = dt.date.today()
    report_id = f"cdc-weekly-{issue.get('issue_range', {}).get('to', today.isoformat())}"
    artifacts = issue.get("artifacts", {})
    web_preview = artifacts.get("web_html") or "output/web.generated.html"
    email_preview = artifacts.get("email_html") or "output/email.generated.html"
    report = {
        "id": report_id,
        "period_label": issue.get("issue_range", {}).get("to", today.isoformat()),
        "status": "draft",
        "workflow_state": "待審核",
        "issue_range": issue.get("issue_range", {}),
        "subject": issue.get("subject", "疫情訊息-待審核草稿"),
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "version": 1,
        "last_modified_by": {"id": "system", "display_name": "system"},
        "last_saved_at": now_iso(),
        "edit_lock": clear_lock(),
        "reviewer": "",
        "preview": {"web": web_preview, "email": email_preview},
        "sections": sections_from_issue(issue),
        "link_overrides": [],
        "audit_log": [
            {
                "at": now_iso(),
                "actor": "system",
                "action": "import_generated_issue_as_draft",
                "note": f"Imported from {source.relative_to(BASE_DIR)}. No publishing or sending was triggered.",
            }
        ],
    }
    data = read_json(REPORTS_PATH)
    reports = [item for item in data.get("reports", []) if item.get("id") != report_id]
    reports.insert(0, report)
    data["reports"] = reports
    write_json(REPORTS_PATH, data)
    return report


class AdminHandler(BaseHTTPRequestHandler):
    server_version = "CDCAdminPreview/0.1"

    def send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

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
        if path == "/api/resources":
            query = parse_qs(parsed.query).get("q", [""])[0].lower()
            resources = flatten_resources()
            if query:
                resources = [
                    item
                    for item in resources
                    if query in json.dumps(item, ensure_ascii=False).lower()
                ]
            self.send_json({"resources": resources[:80]})
            return
        if path == "/api/users":
            query = parse_qs(parsed.query)
            user = authenticate(query.get("admin_id", [""])[0], query.get("passcode", [""])[0])
            if not user:
                self.send_json({"error": "invalid_admin_credentials"}, 401)
                return
            self.send_json({"users": all_public_users(), "can_manage": user.get("role") == "owner"})
            return
        self.serve_static(path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/login":
            body = self.read_body()
            user = authenticate(body.get("admin_id", ""), body.get("passcode", ""))
            if not user:
                self.send_json({"error": "invalid_admin_credentials"}, 401)
                return
            self.send_json({"user": user})
            return
        if parsed.path == "/api/suggest-links":
            body = self.read_body()
            self.send_json({"suggestion": suggest_links(body.get("title", ""), body.get("summary", ""))})
            return
        if parsed.path.startswith("/api/reports/") and parsed.path.endswith("/lock"):
            report_id = parsed.path.split("/")[-2]
            body = self.read_body()
            user = authenticate(body.get("admin_id", ""), body.get("passcode", ""))
            if not user:
                self.send_json({"error": "invalid_admin_credentials"}, 401)
                return
            if not has_permission(user, "edit_content"):
                self.send_json({"error": "edit_permission_required"}, 403)
                return
            self.update_lock(report_id, user)
            return
        if parsed.path.startswith("/api/reports/") and parsed.path.endswith("/unlock"):
            report_id = parsed.path.split("/")[-2]
            body = self.read_body()
            user = authenticate(body.get("admin_id", ""), body.get("passcode", ""))
            if not user:
                self.send_json({"error": "invalid_admin_credentials"}, 401)
                return
            self.release_lock(report_id, user)
            return
        if parsed.path == "/api/import-generated":
            self.send_json({"report": import_generated_issue()})
            return
        if parsed.path == "/api/users":
            body = self.read_body()
            actor = require_owner(body)
            if not actor:
                self.send_json({"error": "owner_permission_required"}, 403)
                return
            try:
                user = upsert_admin_user(actor, body.get("user", {}))
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
                return
            self.send_json({"user": user, "users": all_public_users()})
            return
        self.send_json({"error": "unsupported_preview_only_endpoint"}, 404)

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/reports/"):
            self.send_json({"error": "unsupported_preview_only_endpoint"}, 404)
            return
        report_id = parsed.path.rsplit("/", 1)[-1]
        body = self.read_body()
        user = authenticate(body.get("admin_id", ""), body.get("passcode", ""))
        if not user:
            self.send_json({"error": "invalid_admin_credentials"}, 401)
            return
        if not has_permission(user, "save_draft"):
            self.send_json({"error": "save_draft_permission_required"}, 403)
            return
        data = read_json(REPORTS_PATH)
        reports = data.get("reports", [])
        for index, report in enumerate(reports):
            if report.get("id") == report_id:
                current_lock = active_lock(report)
                if not current_lock:
                    self.send_json({"error": "edit_lock_required"}, 409)
                    return
                if current_lock.get("locked_by") != user["id"]:
                    self.send_json({"error": "report_locked", "lock": current_lock}, 409)
                    return
                expected_version = body.get("version")
                if expected_version is not None and expected_version != report.get("version", 1):
                    self.send_json({"error": "version_conflict", "current": hydrate_report(report)}, 409)
                    return
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
                saved["reviewer"] = user["display_name"]
                saved["version"] = int(report.get("version", 1)) + 1
                saved["edit_lock"] = lock_for(user)
                saved.setdefault("audit_log", []).append(
                    {
                        "at": now_iso(),
                        "actor": user["display_name"],
                        "action": "save_draft",
                        "note": f"{audit_note(report, saved, override_count)}。Saved locally only. No email, publishing, or deployment was triggered.",
                    }
                )
                reports[index] = saved
                data["reports"] = reports
                write_json(REPORTS_PATH, data)
                self.send_json({"report": hydrate_report(saved)})
                return
        self.send_json({"error": "report_not_found"}, 404)

    def update_lock(self, report_id: str, user: dict) -> None:
        data = read_json(REPORTS_PATH)
        reports = data.get("reports", [])
        for index, report in enumerate(reports):
            if report.get("id") != report_id:
                continue
            current = active_lock(report)
            if current and current.get("locked_by") != user["id"]:
                self.send_json({"error": "report_locked", "lock": current}, 409)
                return
            report["edit_lock"] = lock_for(user)
            report.setdefault("audit_log", []).append(
                {
                    "at": now_iso(),
                    "actor": user["display_name"],
                    "action": "acquire_edit_lock",
                    "note": "開始編輯此期草稿。",
                }
            )
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
            current = active_lock(report)
            if current and current.get("locked_by") not in {"", user["id"]}:
                self.send_json({"error": "report_locked", "lock": current}, 409)
                return
            report["edit_lock"] = clear_lock()
            report.setdefault("audit_log", []).append(
                {
                    "at": now_iso(),
                    "actor": user["display_name"],
                    "action": "release_edit_lock",
                    "note": "結束編輯鎖定。",
                }
            )
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
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format: str, *args: object) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "8787"))
    host = os.environ.get("HOST", "127.0.0.1")
    server = ThreadingHTTPServer((host, port), AdminHandler)
    print(f"Admin portal: http://{host}:{port}/")
    print("Preview/edit/archive only. No send or publish endpoints are available.")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
