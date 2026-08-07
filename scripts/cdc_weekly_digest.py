#!/usr/bin/env python3
"""
CDC epidemic weekly digest automation framework.

Phase 1 default behavior is preview-only: fetch, filter, summarize structure,
render HTML files, and optionally send only when explicitly enabled.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import email.message
import json
import re
import smtplib
import ssl
import sys
from html import escape
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin
from urllib.error import URLError
from urllib.request import Request, urlopen


BASE_URL = "https://www.cdc.gov.tw"
NEWS_LIST_URL = "https://www.cdc.gov.tw/Bulletin/List/MmgtpeidAR5Ooai4-fgHzQ"
EDU_URL = "https://edu.ntuh.gov.tw/index/login?next=%2F"
KM_URL = "https://km.ntuh.gov.tw/km/listfolders.aspx?uid=531"
RESOURCE_MAPPING_PATH = Path("data/resource_mapping.json")
EDU_COURSES_PATH = Path("data/edu_courses.json")
KM_DOCUMENTS_PATH = Path("data/km_documents.json")
DEFAULT_TEST_RECIPIENT = "inq36@ntuh.gov.tw"

try:
    from resource_linker import load_mapping as load_resource_mapping
    from resource_linker import suggest_links as suggest_resource_links
except ImportError:
    load_resource_mapping = None
    suggest_resource_links = None

DISEASE_KEYWORDS = {
    "新冠": ["新冠", "COVID", "SARS-CoV-2", "冠狀病毒", "呼吸道"],
    "肺炎鏈球菌": ["肺炎鏈球菌", "IPD", "侵襲性肺炎鏈球菌"],
    "流感": ["流感", "類流感", "influenza"],
    "傷寒": ["傷寒", "沙門氏菌", "腸道", "食媒", "腹瀉"],
    "登革熱": ["登革熱", "病媒蚊", "防蚊", "孳生源"],
    "日本腦炎": ["日本腦炎", "病媒蚊", "三斑家蚊"],
    "恙蟲病": ["恙蟲病", "恙蟎"],
    "腸病毒": ["腸病毒", "手足口病", "疱疹性咽峽炎"],
    "M痘": ["M痘", "Mpox"],
    "伊波拉": ["伊波拉", "Ebola"],
}


@dataclasses.dataclass
class Article:
    title: str
    date: dt.date
    url: str
    body: str = ""


def fallback_km_document() -> dict[str, str]:
    return {"name": "KM系統感染管制手冊目錄", "url": KM_URL, "matched": "fallback"}


def fallback_edu_course() -> dict[str, str]:
    return {"name": "臺大醫院教育訓練管理系統", "url": EDU_URL, "matched": "fallback"}


def load_edu_courses(path: Path = EDU_COURSES_PATH) -> tuple[list[dict], dict[str, str]]:
    if not path.exists():
        return [], fallback_edu_course()
    data = json.loads(path.read_text(encoding="utf-8"))
    fallback = data.get("fallback") or fallback_edu_course()
    fallback.setdefault("name", "臺大醫院教育訓練管理系統")
    fallback.setdefault("url", EDU_URL)
    fallback["matched"] = "fallback"
    courses = [course for course in data.get("courses", []) if course.get("enabled", True) and course.get("url")]
    return courses, fallback


def load_km_documents(path: Path = KM_DOCUMENTS_PATH) -> tuple[list[dict], dict[str, str]]:
    if not path.exists():
        return [], fallback_km_document()
    data = json.loads(path.read_text(encoding="utf-8"))
    fallback = data.get("fallback") or fallback_km_document()
    fallback.setdefault("name", "KM系統感染管制手冊目錄")
    fallback.setdefault("url", KM_URL)
    fallback["matched"] = "fallback"
    docs = [doc for doc in data.get("documents", []) if doc.get("enabled", True) and doc.get("url")]
    return docs, fallback


def infer_disease_topics(text: str) -> list[str]:
    topics = []
    lowered = text.lower()
    for topic, keywords in DISEASE_KEYWORDS.items():
        if topic.lower() in lowered:
            topics.append(topic)
    for topic, keywords in DISEASE_KEYWORDS.items():
        if topic in topics:
            continue
        if any(keyword.lower() in lowered for keyword in keywords):
            topics.append(topic)
    return topics


def match_km_document(article: Article, documents: list[dict], fallback: dict[str, str]) -> dict[str, str]:
    return match_topic_resource(article, documents, fallback, "KM 相關文件")


def match_edu_course(article: Article, courses: list[dict], fallback: dict[str, str]) -> dict[str, str]:
    return match_topic_resource(article, courses, fallback, "相關教育課程")


def match_topic_resource(article: Article, resources: list[dict], fallback: dict[str, str], default_name: str) -> dict[str, str]:
    haystack = f"{article.title}\n{article.body}"
    topics = infer_disease_topics(haystack)
    best_resource = None
    best_score = 0
    for resource in resources:
        name = str(resource.get("name", default_name))
        keywords = [str(item) for item in resource.get("keywords", [])]
        aliases = [str(item) for item in resource.get("aliases", [])]
        score = 0
        for topic in topics:
            if topic in name:
                score += 25
            if topic in keywords or topic in aliases:
                score += 25
        for keyword in keywords + aliases:
            if keyword and keyword.lower() in haystack.lower():
                score += 8
        if name and name in haystack:
            score += 12
        if score > best_score:
            best_score = score
            best_resource = resource
    if not best_resource:
        return dict(fallback)
    return {
        "name": str(best_resource.get("name", default_name)),
        "url": str(best_resource["url"]),
        "matched": "topic",
    }


def topic_resource_label(prefix: str, resource: dict[str, str], item: dict, pending_text: str) -> str:
    if resource.get("matched") != "fallback":
        return f"{prefix}：{resource.get('name', '')}"
    topics = infer_disease_topics(str(item.get("title", "")))
    if not topics:
        topics = infer_disease_topics(f"{item.get('title', '')}\n{item.get('summary', '')}")
    if topics:
        return f"{prefix}：{topics[0]}（{pending_text}）"
    return f"{prefix}：{resource.get('name', '')}"


def is_first_or_third_tuesday(today: dt.date) -> bool:
    if today.weekday() != 1:
      return False
    occurrence = (today.day - 1) // 7 + 1
    return occurrence in {1, 3}


def fetch_html(url: str) -> str:
    request = Request(url, headers={"User-Agent": "NTUH-IPC-CDC-Digest/0.1"})
    try:
        response = urlopen(request, timeout=30)
    except URLError as exc:
        if "CERTIFICATE_VERIFY_FAILED" not in str(exc):
            raise
        print(f"Warning: SSL verification failed for {url}; retrying public fetch without verification.", file=sys.stderr)
        response = urlopen(request, timeout=30, context=ssl._create_unverified_context())
    with response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def strip_tags(html: str) -> str:
    text = re.sub(r"<(script|style)[^>]*>.*?</\\1>", "", html, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", "\n", text)
    text = re.sub(r"&nbsp;?", " ", text)
    text = text.replace("\r", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text)
    return text.strip()


def extract_article_body(html: str) -> str:
    marker = "發佈日期"
    start = html.find(marker)
    if start < 0:
        return strip_tags(html)
    section_end = html.find("</section>", start)
    if section_end < 0:
        section_end = len(html)
    article_html = html[start:section_end]
    article_html = re.sub(r'<div[^>]+class="text-right"[^>]*>.*?</div>', "", article_html, flags=re.I | re.S)
    text = strip_tags(article_html)
    text = re.sub(r"^發佈日期[:：]\s*\d{4}-\d{2}-\d{2}\s*", "", text)
    return text.strip()


def parse_news_list(html: str, since: dt.date, until: dt.date) -> list[Article]:
    pattern = re.compile(
        r'<a[^>]+href="(?P<href>/Bulletin/Detail/[^"]+typeid=9)"[^>]+title="(?P<title>[^"]+)"[^>]*>(?P<body>.*?)</a>',
        re.I | re.S,
    )
    year_pattern = re.compile(r'<p[^>]+class="icon-year"[^>]*>\s*(?P<year>20\d{2})\s*-\s*(?P<month>\d{1,2})\s*</p>', re.I)
    day_pattern = re.compile(r'<p[^>]+class="icon-date"[^>]*>\s*(?P<day>\d{1,2})\s*</p>', re.I)
    articles: list[Article] = []
    for match in pattern.finditer(html):
        year_match = year_pattern.search(match["body"])
        day_match = day_pattern.search(match["body"])
        if not year_match or not day_match:
            continue
        date = dt.date(int(year_match["year"]), int(year_match["month"]), int(day_match["day"]))
        if since <= date <= until:
            articles.append(
                Article(
                    title=re.sub(r"\s+", " ", match["title"]).strip(),
                    date=date,
                    url=urljoin(BASE_URL, match["href"].replace("&amp;", "&")),
                )
            )
    return articles


def should_exclude(article: Article) -> bool:
    title = article.title
    clarification = any(token in title for token in ("澄清", "更正", "錯誤資訊", "不實訊息"))
    vaccine_or_drug = any(token in title for token in ("疫苗", "藥物", "抗病毒", "藥劑"))
    return clarification and vaccine_or_drug


def objective_rewrite(text: str) -> str:
    text = re.sub(r"疾病管制署\(下稱疾管署\)", "疾管署", text)
    text = re.sub(r"疾管署今\([^)]*\)日(表示|指出|說明|呼籲|提醒|強調|公布|宣布)[，,]?", "疾管署資料顯示，", text)
    text = re.sub(r"疾管署(表示|指出|說明|呼籲|提醒|強調|公布|宣布)[，,]?", "疾管署資料顯示，", text)
    text = re.sub(r"署長[^，。]*(表示|指出|說明)[，,]?", "疾管署資料顯示，", text)
    text = re.sub(r"發言人[^，。]*(表示|指出|說明)[，,]?", "疾管署資料顯示，", text)
    return text


def classify(article: Article) -> str:
    title = article.title
    if any(key in title for key in ("新冠", "肺炎鏈球菌", "流感")):
        return "respiratory"
    if any(key in title for key in ("傷寒", "腸", "腹瀉", "食")):
        return "foodborne"
    if any(key in title for key in ("登革熱", "日本腦炎", "恙蟲", "蚊")):
        return "vectorborne"
    return "other"


def severity_rank(article: Article) -> tuple[int, dt.date]:
    title = article.title
    if any(key in title for key in ("死亡", "首例", "第一類", "第五類", "重症")):
        rank = 0
    elif any(key in title for key in ("上升", "流行期", "群聚")):
        rank = 1
    else:
        rank = 2
    return rank, dt.date.fromordinal(dt.date.max.toordinal() - article.date.toordinal())


def enrich_articles(articles: Iterable[Article]) -> list[Article]:
    enriched = []
    for article in articles:
        html = fetch_html(article.url)
        text = extract_article_body(html)
        article.body = objective_rewrite(text)
        enriched.append(article)
    return enriched


def build_issue(articles: list[Article], today: dt.date) -> dict:
    edu_courses, edu_fallback = load_edu_courses()
    km_documents, km_fallback = load_km_documents()
    resource_mapping = None
    if RESOURCE_MAPPING_PATH.exists() and load_resource_mapping and suggest_resource_links:
        resource_mapping = load_resource_mapping(RESOURCE_MAPPING_PATH)
    sections: dict[str, list[Article]] = {"respiratory": [], "foodborne": [], "vectorborne": [], "other": []}
    for article in articles:
        sections[classify(article)].append(article)
    for items in sections.values():
        items.sort(key=severity_rank)
    focus = "；".join(article.title.split(" ")[0][:24] for article in sorted(articles, key=severity_rank)[:5])
    return {
        "generated_at": dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(),
        "issue_range": {"from": (today - dt.timedelta(days=14)).isoformat(), "to": today.isoformat()},
        "subject": f"疫情訊息- {focus[:150]}",
        "sections": {
            key: [
                build_issue_item(item, edu_courses, edu_fallback, km_documents, km_fallback, resource_mapping)
                for item in value
            ]
            for key, value in sections.items()
            if value
        },
    }


def build_issue_item(
    item: Article,
    edu_courses: list[dict],
    edu_fallback: dict[str, str],
    km_documents: list[dict],
    km_fallback: dict[str, str],
    resource_mapping: dict | None,
) -> dict:
    summary = objective_rewrite(item.body[:260]).strip()
    if resource_mapping and suggest_resource_links:
        suggestion = suggest_resource_links(item.title, summary, resource_mapping)
        education_course = suggestion["education"]
        km_document = suggestion["km"]
    else:
        education_course = match_edu_course(item, edu_courses, edu_fallback)
        km_document = match_km_document(item, km_documents, km_fallback)
    return {
        "title": item.title,
        "date": item.date.isoformat(),
        "url": item.url,
        "summary": summary,
        "education_course": education_course,
        "km_document": km_document,
    }


def render_simple_email(issue: dict) -> str:
    blocks = []
    for section, items in issue["sections"].items():
        blocks.append(f"<h2>{escape(section)}</h2>")
        for item in items:
            education_course = item.get("education_course") or fallback_edu_course()
            km_document = item.get("km_document") or fallback_km_document()
            education_label = topic_resource_label("課程", education_course, item, "待確認")
            km_label = topic_resource_label("KM", km_document, item, "待確認")
            blocks.append(
                f"<article><h3>{escape(item['title'])}</h3>"
                f"<p>{escape(item['summary'])}</p>"
                f"<p><a href='{escape(education_course['url'])}'>{escape(education_label)}</a> "
                f"<a href='{escape(km_document['url'])}'>{escape(km_label)}</a> "
                f"<a href='{escape(item['url'])}'>CDC 原文</a></p></article>"
            )
    return (
        "<!doctype html><html lang='zh-Hant'><meta charset='utf-8'>"
        "<body style='font-family:Microsoft JhengHei,Arial,sans-serif;background:#eef7f1;padding:24px'>"
        "<main style='max-width:760px;margin:auto;background:#fffdf7;padding:24px;border-radius:8px'>"
        f"<h1>{escape(issue['subject'])}</h1>{''.join(blocks)}"
        "<footer style='text-align:center;margin-top:24px'>資料來源：疾病管制署<br>~臺大醫院感染管制中心關心您~</footer>"
        "</main></body></html>"
    )


def render_simple_web(issue: dict) -> str:
    blocks = []
    section_names = {
        "respiratory": "呼吸道傳染病",
        "foodborne": "腸道與食媒傳染病",
        "vectorborne": "病媒蚊傳染病",
        "other": "其他疫情訊息",
    }
    for section, items in issue["sections"].items():
        blocks.append(f"<section class='section'><h2>{escape(section_names.get(section, section))}</h2>")
        for item in items:
            education_course = item.get("education_course") or fallback_edu_course()
            km_document = item.get("km_document") or fallback_km_document()
            education_label = topic_resource_label("課程", education_course, item, "待確認")
            km_label = topic_resource_label("KM", km_document, item, "待確認")
            blocks.append(
                f"<article class='card'><p class='date'>{escape(item['date'])}</p>"
                f"<h3>{escape(item['title'])}</h3>"
                f"<p>{escape(item['summary'])}</p>"
                f"<details><summary>展開更多內容</summary><p>{escape(item['summary'])}</p></details>"
                f"<p class='links'><a href='{escape(education_course['url'])}'>{escape(education_label)}</a> "
                f"<a href='{escape(km_document['url'])}'>{escape(km_label)}</a> "
                f"<a href='{escape(item['url'])}'>CDC 原文</a></p></article>"
            )
        blocks.append("</section>")
    return (
        "<!doctype html><html lang='zh-Hant'><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width, initial-scale=1'>"
        f"<title>{escape(issue['subject'])}</title>"
        "<style>"
        "body{margin:0;font-family:Microsoft JhengHei,Arial,sans-serif;color:#153f32;background:linear-gradient(135deg,#fff6d7,#e2f2ed 48%,#fffdf6)}"
        "header{padding:48px 24px 32px;max-width:1040px;margin:auto}"
        "h1{font-size:clamp(32px,7vw,72px);margin:0 0 12px;letter-spacing:0}"
        ".range{display:inline-flex;padding:8px 14px;border-radius:999px;background:#fffdf6;font-weight:800;color:#3e6f4f}"
        "main{max-width:1040px;margin:auto;padding:0 24px 48px}.section{margin:28px 0}.section h2{font-size:26px}"
        ".card{background:rgba(255,253,246,.92);border:1px solid #d7e6dc;border-radius:8px;padding:18px;margin:14px 0;box-shadow:0 12px 28px rgba(46,128,104,.08)}"
        ".date{color:#5f756c;font-weight:800}.links{display:flex;gap:10px;flex-wrap:wrap}.links a{color:#17604d;font-weight:900}"
        "details{border-top:1px dashed #c8dacd;margin-top:12px;padding-top:10px}footer{text-align:center;padding:32px;color:#5f756c}"
        "@media(max-width:640px){header,main{padding-left:16px;padding-right:16px}.links{display:grid}}"
        "</style>"
        f"<header><span class='range'>{escape(issue['issue_range']['from'])} - {escape(issue['issue_range']['to'])}</span>"
        "<h1>疫情訊息週報</h1><p>最近有哪些疫情要注意？幫你把近兩週重點整理好了，花一分鐘看完風險提醒、通報重點和院內感染管制資源。</p></header>"
        f"<main>{''.join(blocks)}</main>"
        "<footer>資料來源：疾病管制署<br>~臺大醫院感染管制中心關心您~</footer>"
        "</html>"
    )


def issue_id(issue: dict) -> str:
    return f"cdc-weekly-{issue['issue_range']['to']}"


def write_issue_artifacts(issue: dict, email_html: str, web_html: str) -> dict[str, str]:
    output_dir = Path("output")
    issue_dir = output_dir / "issues" / issue_id(issue)
    issue_dir.mkdir(parents=True, exist_ok=True)
    issue_path = issue_dir / "issue.json"
    email_path = issue_dir / "email.html"
    web_path = issue_dir / "web.html"
    issue["artifacts"] = {
        "issue_json": str(issue_path).replace("\\", "/"),
        "email_html": str(email_path).replace("\\", "/"),
        "web_html": str(web_path).replace("\\", "/"),
    }
    issue_path.write_text(json.dumps(issue, ensure_ascii=False, indent=2), encoding="utf-8")
    email_path.write_text(email_html, encoding="utf-8")
    web_path.write_text(web_html, encoding="utf-8")

    output_dir.mkdir(exist_ok=True)
    Path("output/current_issue.generated.json").write_text(json.dumps(issue, ensure_ascii=False, indent=2), encoding="utf-8")
    Path("output/email.generated.html").write_text(email_html, encoding="utf-8")
    Path("output/web.generated.html").write_text(web_html, encoding="utf-8")
    return issue["artifacts"]


def send_email(html: str, subject: str, recipient: str, smtp_host: str, smtp_port: int, sender: str) -> None:
    message = email.message.EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = recipient
    message.set_content("此郵件需要 HTML 檢視。資料來源：疾病管制署")
    message.add_alternative(html, subtype="html")
    with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as smtp:
        smtp.starttls()
        smtp.login(sender, input("SMTP password: "))
        smtp.send_message(message)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--today", default=dt.date.today().isoformat())
    parser.add_argument("--force", action="store_true", help="Run even if today is not the first or third Tuesday.")
    parser.add_argument("--send-test", action="store_true", help="Send to the configured test recipient. Disabled by default.")
    parser.add_argument("--recipient", default=DEFAULT_TEST_RECIPIENT)
    parser.add_argument("--smtp-host")
    parser.add_argument("--smtp-port", type=int, default=587)
    parser.add_argument("--sender")
    args = parser.parse_args(argv)

    today = dt.date.fromisoformat(args.today)
    if not args.force and not is_first_or_third_tuesday(today):
        print(f"Skip: {today} is not the first or third Tuesday.")
        return 0

    since = today - dt.timedelta(days=14)
    list_html = fetch_html(NEWS_LIST_URL)
    articles = [article for article in parse_news_list(list_html, since, today) if not should_exclude(article)]
    articles = enrich_articles(articles)
    issue = build_issue(articles, today)

    html = render_simple_email(issue)
    web_html = render_simple_web(issue)
    artifacts = write_issue_artifacts(issue, html, web_html)
    print(f"Rendered {len(articles)} CDC articles into {artifacts['email_html']} and {artifacts['web_html']}")

    if args.send_test:
        missing = [name for name in ("smtp_host", "sender") if not getattr(args, name)]
        if missing:
            raise SystemExit(f"Missing SMTP settings: {', '.join(missing)}")
        send_email(html, issue["subject"], args.recipient, args.smtp_host, args.smtp_port, args.sender)
        print(f"Sent test email to {args.recipient}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
