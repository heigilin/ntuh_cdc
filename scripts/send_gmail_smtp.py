#!/usr/bin/env python3
import sys
import smtplib
import email.message
import getpass
import json
from pathlib import Path

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

recipients = ["pengyj@ntuh.gov.tw", "inq36@ntuh.gov.tw"]

def send_via_smtp(password: str, sender: str = "heigilin123@gmail.com"):
    msg = email.message.EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg.set_content("請開啟 HTML 格式檢視本期疫情訊息。")
    msg.add_alternative(html_body, subtype="html")

    print(f"Connecting to smtp.gmail.com:587 (Sender: {sender}, Recipients: {recipients})...")
    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as server:
            server.starttls()
            server.login(sender, password)
            server.send_message(msg)
        print("SUCCESS: Email sent successfully via Gmail SMTP!")
    except Exception as e:
        if sender != "heigilin@gmail.com":
            print(f"Sender {sender} failed: {e}. Trying fallback sender heigilin@gmail.com...")
            send_via_smtp(password, sender="heigilin@gmail.com")
        else:
            raise

if __name__ == "__main__":
    if len(sys.argv) > 1:
        pwd = sys.argv[1]
        sender_acc = sys.argv[2] if len(sys.argv) > 2 else "heigilin123@gmail.com"
    else:
        pwd = getpass.getpass("Enter Gmail App Password: ")
        sender_acc = "heigilin123@gmail.com"
    send_via_smtp(pwd, sender_acc)
