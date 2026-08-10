from pathlib import Path
import argparse
import json


DEFAULT_SUBJECT = "疫情訊息-待審核草稿"
DEFAULT_TO = "inq36@ntuh.gov.tw"
CID_TRAIN = "email-train-preview@ntuh-cdc"


def build_mail_html(base_dir: Path, html_path: Path, use_cid_image: bool) -> str:
    if not html_path.is_absolute():
        html_path = base_dir / html_path
    html = html_path.read_text(encoding="utf-8")
    if use_cid_image:
        html = html.replace('src="assets/email-train-preview.jpg"', f'src="cid:{CID_TRAIN}"')
    return html


def attach_inline_image(mail, image_path: Path, content_id: str) -> None:
    attachment = mail.Attachments.Add(str(image_path.resolve()))
    # Outlook MAPI property: PR_ATTACH_CONTENT_ID
    attachment.PropertyAccessor.SetProperty(
        "http://schemas.microsoft.com/mapi/proptag/0x3712001F",
        content_id,
    )
    # PR_ATTACHMENT_HIDDEN
    attachment.PropertyAccessor.SetProperty(
        "http://schemas.microsoft.com/mapi/proptag/0x7FFE000B",
        True,
    )


def load_default_subject(base_dir: Path) -> str:
    issue_path = base_dir / "data" / "current_issue.json"
    if not issue_path.exists():
        return DEFAULT_SUBJECT
    try:
        issue = json.loads(issue_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return DEFAULT_SUBJECT
    return issue.get("subject") or DEFAULT_SUBJECT


def main() -> None:
    parser = argparse.ArgumentParser(description="Open an Outlook preview with CID-embedded email assets.")
    parser.add_argument("--to", default=DEFAULT_TO)
    parser.add_argument("--subject", default=DEFAULT_SUBJECT)
    parser.add_argument("--html", default="output/正式寄信用-email-hosted.html")
    parser.add_argument("--cid-image", action="store_true", help="Embed assets/email-train-preview.jpg as an inline CID image.")
    parser.add_argument("--send", action="store_true", help="Send immediately. Default opens an Outlook preview.")
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parents[1]
    if args.subject == DEFAULT_SUBJECT:
        args.subject = load_default_subject(base_dir)
    image_path = base_dir / "assets" / "email-train-preview.jpg"
    if args.cid_image and not image_path.exists():
        raise FileNotFoundError(image_path)

    try:
        import win32com.client as win32
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "Missing pywin32. Install it in this Python environment with: python -m pip install pywin32"
        ) from exc

    outlook = win32.Dispatch("outlook.application")
    mail = outlook.CreateItem(0)
    mail.Subject = args.subject
    mail.To = args.to
    mail.HTMLBody = build_mail_html(base_dir, Path(args.html), args.cid_image)
    if args.cid_image:
        attach_inline_image(mail, image_path, CID_TRAIN)

    if args.send:
        mail.Send()
        print(f"Sent Outlook email to {args.to}")
    else:
        mail.Display()
        print("Opened Outlook preview. Review it manually, then click Send in Outlook.")


if __name__ == "__main__":
    main()
