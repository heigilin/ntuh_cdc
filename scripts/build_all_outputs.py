#!/usr/bin/env python3
import os
import shutil
import json
import base64
import io
import subprocess
from pathlib import Path
from PIL import Image

BASE_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = BASE_DIR / "output"
DATA_DIR = BASE_DIR / "data"

OUTPUT_DIR.mkdir(exist_ok=True)

# 1. Read current_issue.json dynamically
current_issue_path = DATA_DIR / "current_issue.json"
if current_issue_path.exists():
    issue_data = json.loads(current_issue_path.read_text(encoding="utf-8"))
    issue_date = issue_data.get("display_date", "2026-08-18")
    issue_id = f"cdc-weekly-{issue_date}"
    issue_dir = OUTPUT_DIR / "issues" / issue_id
    issue_dir.mkdir(parents=True, exist_ok=True)

    (OUTPUT_DIR / "current_issue.generated.json").write_text(json.dumps(issue_data, ensure_ascii=False, indent=2), encoding="utf-8")
    (issue_dir / "issue.json").write_text(json.dumps(issue_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Synced current_issue.json for date {issue_date}.")

# 2. Update web-preview-updated.html, index.html, web.generated.html, and archive web.html
web_preview_path = BASE_DIR / "web-preview.html"
if web_preview_path.exists():
    web_content = web_preview_path.read_text(encoding="utf-8")
    (BASE_DIR / "index.html").write_text(web_content, encoding="utf-8")
    (OUTPUT_DIR / "web-preview-updated.html").write_text(web_content, encoding="utf-8")
    (OUTPUT_DIR / "web.generated.html").write_text(web_content, encoding="utf-8")
    if 'issue_dir' in locals():
        (issue_dir / "web.html").write_text(web_content, encoding="utf-8")
    print("Updated index.html, web-preview-updated.html, web.generated.html, and archive web.html.")

# 3. Build email-hosted.html & paste-email.html
email_preview_path = BASE_DIR / "email-preview.html"
if email_preview_path.exists():
    email_content = email_preview_path.read_text(encoding="utf-8")
    (OUTPUT_DIR / "email.generated.html").write_text(email_content, encoding="utf-8")
    if 'issue_dir' in locals():
        (issue_dir / "email.html").write_text(email_content, encoding="utf-8")
    
    (OUTPUT_DIR / "email-hosted.html").write_text(email_content, encoding="utf-8")
    (OUTPUT_DIR / "正式寄信用-email-hosted.html").write_text(email_content, encoding="utf-8")
    (OUTPUT_DIR / "paste-email.html").write_text(email_content, encoding="utf-8")
    print("Built output/email-hosted.html and paste-email.html.")

# 4. Build SharePoint/intranet post drafts
intranet_builder = BASE_DIR / "scripts" / "build_intranet_draft.py"
if intranet_builder.exists():
    subprocess.run(["python", str(intranet_builder)], check=True)
