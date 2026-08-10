from pathlib import Path
import argparse
from urllib.parse import urljoin


def normalize_base_url(value: str) -> str:
    value = value.strip()
    if not value.startswith(("https://", "http://")):
        raise ValueError("base URL must start with https:// or http://")
    return value if value.endswith("/") else value + "/"


def build_hosted_email(base_dir: Path, base_url: str, output_path: Path) -> None:
    base_url = normalize_base_url(base_url)
    html = (base_dir / "email-preview.html").read_text(encoding="utf-8")

    replacements = {
        'href="web-preview.html"': f'href="{urljoin(base_url, "web-preview.html")}"',
        'href="web-preview.html#': f'href="{urljoin(base_url, "web-preview.html")}#',
        'src="assets/': f'src="{urljoin(base_url, "assets/")}',
    }
    for old, new in replacements.items():
        html = html.replace(old, new)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build an email HTML file that uses hosted HTTPS asset and web-preview URLs."
    )
    parser.add_argument(
        "--base-url",
        required=True,
        help="Public or intranet HTTPS folder URL containing web-preview.html and assets/.",
    )
    parser.add_argument(
        "--output",
        default="output/email-hosted.html",
        help="Output HTML path. Default: output/email-hosted.html",
    )
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parents[1]
    output_path = (base_dir / args.output).resolve()
    build_hosted_email(base_dir, args.base_url, output_path)
    print(f"Built hosted email: {output_path}")


if __name__ == "__main__":
    main()
