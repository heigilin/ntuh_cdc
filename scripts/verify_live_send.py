#!/usr/bin/env python3
import sys
import json
import smtplib
import email.message
import datetime as dt
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = BASE_DIR / "output"
DATA_DIR = BASE_DIR / "data"

secrets = json.loads((DATA_DIR / ".secrets.json").read_text(encoding="utf-8"))
sender = secrets["sender"]
pwd = secrets["app_password"]

issue = json.loads((DATA_DIR / "current_issue.json").read_text(encoding="utf-8"))
subject = issue.get("subject", "疫情訊息- 【8/18最新期】流感疫情緩升；新冠疫苗8/13全數撥配；登革熱境外防蚊")

paste_html = (OUTPUT_DIR / "paste-email.html").read_text(encoding="utf-8")
intranet_html = (OUTPUT_DIR / "intranet-post-draft.html").read_text(encoding="utf-8")

def send_and_verify(sub: str, html_body: str, recipients: list[str]):
    msg = email.message.EmailMessage()
    msg["Subject"] = sub
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg.set_content("請開啟 HTML 格式檢視本期疫情訊息。")
    msg.add_alternative(html_body, subtype="html")

    print(f"Connecting to smtp.gmail.com:587 for recipients: {recipients}...")
    with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as server:
        server.set_debuglevel(1)
        server.starttls()
        server.login(sender, pwd)
        refused = server.send_message(msg)
        print(f"SMTP send_message finished. Refused dictionary: {refused}")
        print(f"VERIFIED: Email '{sub}' successfully delivered to Gmail SMTP server for {recipients}!")

print("=== VERIFYING EMAIL 1: CDC Weekly Digest ===")
send_and_verify(subject, paste_html, ["pengyj@ntuh.gov.tw", "inq36@ntuh.gov.tw"])

print("\n=== VERIFYING EMAIL 2: Intranet Post Draft ===")
send_and_verify(f"院內網發文草稿- {subject.replace('疫情訊息- ', '')}", intranet_html, ["pengyj@ntuh.gov.tw", "heigilin123@gmail.com"])
