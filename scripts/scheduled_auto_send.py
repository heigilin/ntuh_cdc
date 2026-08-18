#!/usr/bin/env python3
"""
CDC Weekly Digest Scheduled Auto-Send Script.
Runs on 1st and 3rd Monday of each month.
Automatically updates GitHub Pages and sends emails.
"""

import sys
import json
import smtplib
import argparse
import subprocess
import datetime as dt
import email.message
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = BASE_DIR / "output"
DATA_DIR = BASE_DIR / "data"
SECRETS_PATH = DATA_DIR / ".secrets.json"

sys.path.insert(0, str(BASE_DIR / "scripts"))

def is_first_or_third_monday(today: dt.date) -> bool:
    if today.weekday() != 0:  # 0 is Monday
        return False
    occurrence = (today.day - 1) // 7 + 1
    return occurrence in {1, 3}

def send_email(subject: str, html_body: str, sender: str, app_password: str, recipients: list[str]):
    msg = email.message.EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg.set_content("請開啟 HTML 格式檢視本期疫情訊息。")
    msg.add_alternative(html_body, subtype="html")

    print(f"[{dt.datetime.now().isoformat()}] Connecting to smtp.gmail.com:587 (Sender: {sender}, Recipients: {recipients})...")
    with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as server:
        server.starttls()
        server.login(sender, app_password)
        server.send_message(msg)
    print(f"[{dt.datetime.now().isoformat()}] SUCCESS: Weekly digest email sent successfully to {recipients}!")

def push_to_github():
    print(f"[{dt.datetime.now().isoformat()}] Pushing latest web-preview.html and issue data to GitHub Pages...")
    try:
        subprocess.run(["git", "add", "web-preview.html", "data/current_issue.json", "email-preview.html", "scripts/"], check=True, cwd=BASE_DIR)
        subprocess.run(["git", "commit", "-m", f"Auto-update CDC Weekly Digest for {dt.date.today().isoformat()}"], check=False, cwd=BASE_DIR)
        subprocess.run(["git", "push", "origin", "main"], check=True, cwd=BASE_DIR)
        print(f"[{dt.datetime.now().isoformat()}] SUCCESS: GitHub Pages deployed!")
    except Exception as e:
        print(f"Warning: Git push to GitHub Pages encountered an issue: {e}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Run even if today is not 1st or 3rd Monday.")
    args = parser.parse_args()

    today = dt.date.today()
    if not args.force and not is_first_or_third_monday(today):
        print(f"[{today.isoformat()}] Today is not the 1st or 3rd Monday. Skipping execution.")
        return 0

    if not SECRETS_PATH.exists():
        print(f"Error: Secrets file {SECRETS_PATH} not found.")
        return 1

    secrets = json.loads(SECRETS_PATH.read_text(encoding="utf-8"))
    sender = secrets.get("sender", "heigilin123@gmail.com")
    app_password = secrets.get("app_password")
    recipients = secrets.get("recipients", ["pengyj@ntuh.gov.tw", "inq36@ntuh.gov.tw"])
    intranet_draft_recipients = secrets.get(
        "intranet_draft_recipients",
        ["pengyj@ntuh.gov.tw", "heigilin123@gmail.com"],
    )

    if not app_password:
        print("Error: app_password missing in secrets file.")
        return 1

    # 1. Update outputs & Push to GitHub Pages
    print(f"[{today.isoformat()}] Building latest weekly digest outputs...")
    subprocess.run([sys.executable, str(BASE_DIR / "scripts" / "build_all_outputs.py")], check=True)
    push_to_github()

    current_issue_path = DATA_DIR / "current_issue.json"
    issue_data = json.loads(current_issue_path.read_text(encoding="utf-8")) if current_issue_path.exists() else {}
    subject = issue_data.get("subject", "疫情訊息- 【8/18最新期】流感疫情緩升；新冠疫苗8/13全數撥配；登革熱境外防蚊")

    paste_html_path = OUTPUT_DIR / "paste-email.html"
    if not paste_html_path.exists():
        paste_html_path = BASE_DIR / "email-preview.html"
    html_body = paste_html_path.read_text(encoding="utf-8")

    # 2. Send emails
    send_email(subject, html_body, sender, app_password, recipients)
    intranet_html_path = OUTPUT_DIR / "intranet-post-draft.html"
    intranet_txt_path = OUTPUT_DIR / "intranet-post-draft.txt"
    if intranet_html_path.exists():
        intranet_html = intranet_html_path.read_text(encoding="utf-8")
        intranet_subject = f"院內網發文草稿- {subject.replace('疫情訊息- ', '')}"
        send_email(intranet_subject, intranet_html, sender, app_password, intranet_draft_recipients)
        print(f"Intranet plain draft is available at: {intranet_txt_path}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
