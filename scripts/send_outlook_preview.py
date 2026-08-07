from pathlib import Path
import argparse
import win32com.client as win32


DEFAULT_SUBJECT = "【疫情訊息】本週重點與教育訓練連結"
DEFAULT_TO = "inq36@ntuh.gov.tw"
CID_MONKEY = "monkey-sticker@ntuh-cdc"


def build_mail_html(base_dir: Path) -> str:
    html_path = base_dir / "email-preview.html"
    html = html_path.read_text(encoding="utf-8")
    html = html.replace('src="assets/monkey-sticker.gif"', f'src="cid:{CID_MONKEY}"')
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Open an Outlook preview with CID-embedded email assets.")
    parser.add_argument("--to", default=DEFAULT_TO)
    parser.add_argument("--subject", default=DEFAULT_SUBJECT)
    parser.add_argument("--send", action="store_true", help="Send immediately. Default opens an Outlook preview.")
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parents[1]
    image_path = base_dir / "assets" / "monkey-sticker.gif"
    if not image_path.exists():
        raise FileNotFoundError(image_path)

    outlook = win32.Dispatch("outlook.application")
    mail = outlook.CreateItem(0)
    mail.Subject = args.subject
    mail.To = args.to
    mail.HTMLBody = build_mail_html(base_dir)
    attach_inline_image(mail, image_path, CID_MONKEY)

    if args.send:
        mail.Send()
        print(f"Sent Outlook email to {args.to}")
    else:
        mail.Display()
        print("Opened Outlook preview. Review it manually, then click Send in Outlook.")


if __name__ == "__main__":
    main()
