import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]

web_preview_path = BASE_DIR / "web-preview.html"
index_path = BASE_DIR / "index.html"

if web_preview_path.exists():
    content = web_preview_path.read_text(encoding="utf-8")
    
    # 1. Header eyebrow date badge
    content = content.replace(
        "2026/08/03 - 2026/08/18 【8/18最新期】",
        "2026/08/24 - 2026/09/07 【9/07最新期】"
    )
    content = content.replace(
        "2026/08/03 - 2026/08/18 （8/18最新期）",
        "2026/08/24 - 2026/09/07 （9/07最新期）"
    )

    # 2. Card date tags and dates
    content = content.replace('<span class="date-tag">2026-08-11</span>', '<span class="date-tag">2026-09-01</span>')
    content = content.replace('<span class="date-tag">2026-08-04</span>', '<span class="date-tag">2026-08-25</span>')
    content = content.replace('<span class="date-tag">2026-08-06</span>', '<span class="date-tag">2026-08-25</span>')

    web_preview_path.write_text(content, encoding="utf-8")
    index_path.write_text(content, encoding="utf-8")
    print("Updated web-preview.html and index.html with September 2026 dates!")

# Build all outputs and push to GitHub Pages
subprocess.run(["python", str(BASE_DIR / "scripts" / "build_all_outputs.py")], check=True)
subprocess.run(["git", "add", "web-preview.html", "index.html", "data/current_issue.json", "email-preview.html"], check=True, cwd=BASE_DIR)
subprocess.run(["git", "commit", "-m", "Synchronize web-preview.html and index.html for September 7th issue"], check=False, cwd=BASE_DIR)
subprocess.run(["git", "push", "origin", "main", "--force"], check=True, cwd=BASE_DIR)
print("Pushed updated web-preview.html and index.html to GitHub Pages!")
