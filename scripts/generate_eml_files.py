#!/usr/bin/env python3
import email.message
import base64
from pathlib import Path
import subprocess
import json

BASE_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = BASE_DIR / "output"
DATA_DIR = BASE_DIR / "data"

current_issue_path = DATA_DIR / "current_issue.json"
issue_data = json.loads(current_issue_path.read_text(encoding="utf-8")) if current_issue_path.exists() else {}
subject = issue_data.get("subject", "疫情訊息- 新冠疫情流行期；登革熱境外移入；日本腦炎首例死亡；傷寒本土病例；肺鏈疫苗8/10升級")

paste_html_path = OUTPUT_DIR / "paste-email.html"
if not paste_html_path.exists():
    paste_html_path = BASE_DIR / "email-preview.html"

html_body = paste_html_path.read_text(encoding="utf-8")

def create_eml(sender: str, to: str, sub: str, html: str, out_path: Path):
    msg = email.message.EmailMessage()
    msg["Subject"] = sub
    msg["From"] = sender
    msg["To"] = to
    msg.set_content("請開啟 HTML 格式檢視本期疫情訊息。")
    msg.add_alternative(html, subtype="html")
    out_path.write_bytes(msg.as_bytes())
    print(f"Generated EML: {out_path}")

create_eml("heigilin@gmail.com", "pengyj@ntuh.gov.tw", subject, html_body, OUTPUT_DIR / "疫情訊息-pengyj.eml")
create_eml("heigilin@gmail.com", "inq36@ntuh.gov.tw", subject, html_body, OUTPUT_DIR / "疫情訊息-inq36.eml")
create_eml("heigilin@gmail.com", "pengyj@ntuh.gov.tw, inq36@ntuh.gov.tw", subject, html_body, OUTPUT_DIR / "疫情訊息-雙收件者.eml")

# Open EML file with default mail app
eml_file = OUTPUT_DIR / "疫情訊息-雙收件者.eml"
subprocess.run(["powershell", "-Command", f"Start-Process '{eml_file}'"])
print(f"Opened EML in mail client: {eml_file}")
