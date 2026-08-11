#!/usr/bin/env python3
import os
import shutil
import json
import base64
import io
from pathlib import Path
from PIL import Image

BASE_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = BASE_DIR / "output"
DATA_DIR = BASE_DIR / "data"
WEB_PREVIEW_URL = (
    "https://heigilin.github.io/ntuh_cdc/web-preview.html"
)
HOSTED_BASE_URL = (
    "https://heigilin.github.io/ntuh_cdc/"
)

OUTPUT_DIR.mkdir(exist_ok=True)
ISSUE_DATE = "2026-08-11"
ISSUE_ID = f"cdc-weekly-{ISSUE_DATE}"
ISSUE_DIR = OUTPUT_DIR / "issues" / ISSUE_ID
ISSUE_DIR.mkdir(parents=True, exist_ok=True)

# 1. Ensure current_issue.json and output/current_issue.generated.json match
current_issue_path = DATA_DIR / "current_issue.json"
if current_issue_path.exists():
    issue_data = json.loads(current_issue_path.read_text(encoding="utf-8"))
    issue_data["generated_at"] = "2026-08-11T10:00:00+08:00"
    issue_data["display_date"] = ISSUE_DATE
    issue_data["issue_range"] = {"from": "2026-07-28", "to": "2026-08-11"}
    issue_data["subject"] = "疫情訊息- 新冠疫情流行期；登革熱境外移入；日本腦炎首例死亡；傷寒本土病例；肺鏈疫苗8/10升級"
    current_issue_path.write_text(json.dumps(issue_data, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUTPUT_DIR / "current_issue.generated.json").write_text(json.dumps(issue_data, ensure_ascii=False, indent=2), encoding="utf-8")
    (ISSUE_DIR / "issue.json").write_text(json.dumps(issue_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Updated current_issue.json and generated JSONs.")

# 2. Update web-preview-updated.html, web.generated.html, and archive web.html
web_preview_path = BASE_DIR / "web-preview.html"
if web_preview_path.exists():
    web_content = web_preview_path.read_text(encoding="utf-8")
    (OUTPUT_DIR / "web-preview-updated.html").write_text(web_content, encoding="utf-8")
    (OUTPUT_DIR / "web.generated.html").write_text(web_content, encoding="utf-8")
    (ISSUE_DIR / "web.html").write_text(web_content, encoding="utf-8")
    print("Updated web-preview-updated.html, web.generated.html, and archive web.html.")

# 3. Build email-hosted.html
email_preview_path = BASE_DIR / "email-preview.html"
if email_preview_path.exists():
    email_content = email_preview_path.read_text(encoding="utf-8")
    (OUTPUT_DIR / "email.generated.html").write_text(email_content, encoding="utf-8")
    (ISSUE_DIR / "email.html").write_text(email_content, encoding="utf-8")
    
    import subprocess
    cmd = [
        "python",
        str(BASE_DIR / "scripts" / "build_hosted_email.py"),
        "--base-url",
        HOSTED_BASE_URL,
        "--web-url",
        WEB_PREVIEW_URL,
        "--output",
        "output/email-hosted.html"
    ]
    subprocess.run(cmd, check=True)
    shutil.copyfile(OUTPUT_DIR / "email-hosted.html", OUTPUT_DIR / "正式寄信用-email-hosted.html")
    shutil.copyfile(OUTPUT_DIR / "email-hosted.html", ISSUE_DIR / "email.html")
    print("Built output/email-hosted.html.")

# 4. Build output/paste-email.html with base64 inline images
def get_base64_image(path: Path, target_width: int = 0) -> str:
    if not path.exists():
        print(f"Image missing: {path}")
        return ""
    if target_width > 0:
        try:
            with Image.open(path) as img:
                if img.width > target_width:
                    w_percent = target_width / float(img.width)
                    h_size = int(float(img.height) * float(w_percent))
                    img_resized = img.resize((target_width, h_size), Image.Resampling.LANCZOS)
                    buffer = io.BytesIO()
                    img_resized.save(buffer, format="PNG", optimize=True)
                    bytes_data = buffer.getvalue()
                    return base64.b64encode(bytes_data).decode("utf-8")
        except Exception as e:
            print(f"Resize error for {path}: {e}")
    bytes_data = path.read_bytes()
    return base64.b64encode(bytes_data).decode("utf-8")

if email_preview_path.exists():
    content = (OUTPUT_DIR / "email-hosted.html").read_text(encoding="utf-8")
    t_stage_b64 = get_base64_image(BASE_DIR / "assets" / "cutouts" / "T-stage.png", 560)
    q_bee_b64 = get_base64_image(BASE_DIR / "assets" / "cutouts" / "Q-bee-trim.png", 54)
    monkey_b64 = get_base64_image(BASE_DIR / "assets" / "cutouts" / "monkey-trim.png", 54)

    if t_stage_b64:
        content = content.replace("assets/cutouts/T-stage.png", f"data:image/png;base64,{t_stage_b64}")
    if q_bee_b64:
        content = content.replace("assets/cutouts/Q-bee-trim.png", f"data:image/png;base64,{q_bee_b64}")
    if monkey_b64:
        content = content.replace("assets/cutouts/monkey-trim.png", f"data:image/png;base64,{monkey_b64}")

    paste_email_path = OUTPUT_DIR / "paste-email.html"
    paste_email_path.write_text(content, encoding="utf-8")
    print("Built output/paste-email.html.")
