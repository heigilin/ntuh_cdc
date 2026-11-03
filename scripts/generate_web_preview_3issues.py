#!/usr/bin/env python3
"""
Generate complete modern web-preview.html & email-preview.html
holding the latest 3 issues with interactive switcher and full content.
"""
import json
from pathlib import Path

BASE_DIR = Path("Y:/IFC_V/50300/教學資料/院內發疫情訊息專用")
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "output"

current_issue = json.loads((DATA_DIR / "current_issue.json").read_text(encoding="utf-8"))
SUBJECT = current_issue.get("subject", "疫情訊息週報")
ISSUE_BADGE = current_issue.get("issue_badge", "【最新期】")
GITHUB_PAGES_URL = f"https://heigilin.github.io/ntuh_cdc/web-preview.html?v={current_issue.get('display_date', 'latest').replace('-', '')}"

# 歷史期別概要
issues_summary = [
    {
        "id": "current",
        "badge": "【本期最新 · 2026年11月】",
        "date_range": "2026/09/09 - 2026/10/20",
        "title": "流感重症 H1N1 九成；腸病毒重症死亡；M痘 Ib 型境外；登革熱本土群聚",
        "highlight": "流感公費藥劑免快篩開立；腸病毒酒精無效需用漂白水；M痘公費2劑達9成；登革熱NS1快篩通報。"
    },
    {
        "id": "issue-20260907",
        "badge": "【上期回顧 · 2026年9月第1週】",
        "date_range": "2026/08/24 - 2026/09/07",
        "title": "流感就診人次緩升；本季新冠疫苗全數撥配；登革熱境外防蚊",
        "highlight": "國內流感就診人次緩升，長者及幼童注意；新冠疫苗撥配到位；境外移入登革熱防護。",
        "url": "history/issue-2026-09-07.html"
    },
    {
        "id": "issue-20260818",
        "badge": "【前期回顧 · 2026年8月第3週】",
        "date_range": "2026/08/03 - 2026/08/18",
        "title": "流感疫情初升；新冠疫苗8/13配送；首例本土傷寒個案",
        "highlight": "7月上旬起流感上升；新冠合約院所開打；傷寒生食感染防範。",
        "url": "history/issue-2026-08-18.html"
    }
]

# 產生國內焦點疫情 HTML 卡片
domestic_cards_html = ""
for item in current_issue.get("domestic", []):
    category_badge = {
        "respiratory": "呼吸道",
        "foodborne": "腸道食媒",
        "vectorborne": "病媒蚊",
        "special": "特別關注"
    }.get(item.get("category"), "國內焦點")
    
    km_link_html = f'<a class="km-link" href="{item["km_url"]}" target="_blank" rel="noopener">📄 院內指引：{item.get("km_name", "感染管制措施")} ↗</a>' if item.get("km_url") else ""
    
    domestic_cards_html += f"""
    <article class="card {item.get('category', '')}">
      <div class="card-header">
        <span class="badge badge-{item.get('category', 'default')}">{category_badge}</span>
        <span class="date-tag">發布：{item.get('date', '')}</span>
      </div>
      <h3 class="disease-name">{item.get('name', '')}</h3>
      <div class="card-body">
        <p class="status-box"><strong>📊 疫情現況：</strong>{item.get('status', '')}</p>
        <p class="alert-box"><strong>⚠️ 臨床警訊：</strong>{item.get('symptoms', '')}</p>
        <p class="action-box"><strong>🛡️ 防護與處置重點：</strong>{item.get('action', '')}</p>
      </div>
      {km_link_html}
    </article>
    """

# 產生國際近30日重要疫情 HTML
intl_rows_html = ""
for intl in current_issue.get("international", []):
    intl_rows_html += f"""
    <tr class="intl-row">
      <td class="intl-date">{intl.get('date', '')}</td>
      <td class="intl-disease"><span class="badge-intl">{intl.get('disease', '')}</span></td>
      <td class="intl-area"><strong>{intl.get('area', '')}</strong></td>
      <td class="intl-desc">{intl.get('desc', '')}</td>
    </tr>
    """

# 組合完整 web-preview.html
web_html = f"""<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#075f50">
  <title>臺大醫院 感染管制中心｜最新疫情訊息週報</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {{
      --primary: #075f50;
      --primary-dark: #054439;
      --primary-light: #e6f4f1;
      --accent-gold: #b88316;
      --accent-amber: #fff8e7;
      --ink: #112e24;
      --ink-muted: #4a6358;
      --bg: #f4f8f6;
      --card-bg: #ffffff;
      --border: #d4e7df;
      --danger-bg: #fff1f0;
      --danger-border: #ffa39e;
      --danger-text: #cf1322;
      --radius: 12px;
      --shadow: 0 4px 16px rgba(7,95,80,0.08);
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: "Noto Sans TC", -apple-system, BlinkMacSystemFont, "Microsoft JhengHei", sans-serif;
      background: var(--bg);
      color: var(--ink);
      line-height: 1.6;
      padding-bottom: 60px;
    }}
    .site-header {{
      background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%);
      color: #ffffff;
      padding: 32px 20px 24px;
      border-bottom: 4px solid var(--accent-gold);
    }}
    .header-inner {{
      max-width: 1100px;
      margin: 0 auto;
    }}
    .brand-bar {{
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }}
    .brand-title {{
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #bbf2e5;
    }}
    .hero-h1 {{
      font-size: clamp(26px, 4vw, 36px);
      font-weight: 900;
      margin-bottom: 10px;
    }}
    .hero-meta {{
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      font-size: 14px;
    }}
    .tag-badge {{
      background: var(--accent-gold);
      color: #ffffff;
      font-weight: 800;
      padding: 4px 12px;
      border-radius: 999px;
    }}
    .tag-range {{
      background: rgba(255,255,255,0.15);
      padding: 4px 12px;
      border-radius: 6px;
    }}

    /* 3期切換器 */
    .issues-switcher-bar {{
      max-width: 1100px;
      margin: -16px auto 24px;
      padding: 0 16px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
      position: relative;
      z-index: 20;
    }}
    .switcher-card {{
      background: #ffffff;
      border: 2px solid var(--border);
      border-radius: var(--radius);
      padding: 14px 18px;
      box-shadow: var(--shadow);
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
      color: inherit;
      display: block;
    }}
    .switcher-card:hover, .switcher-card.active {{
      border-color: var(--primary);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(7,95,80,0.15);
    }}
    .switcher-card.active {{
      background: #ffffff;
      border-left: 6px solid var(--primary);
    }}
    .switcher-badge {{
      font-size: 13px;
      font-weight: 800;
      color: var(--primary);
      margin-bottom: 4px;
    }}
    .switcher-title {{
      font-size: 14px;
      font-weight: 700;
      color: var(--ink);
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }}

    .main-container {{
      max-width: 1100px;
      margin: 0 auto;
      padding: 0 16px;
    }}

    /* 焦點速覽區 */
    .highlight-banner {{
      background: #ffffff;
      border-left: 6px solid var(--accent-gold);
      border-radius: var(--radius);
      padding: 20px 24px;
      margin-bottom: 28px;
      box-shadow: var(--shadow);
    }}
    .highlight-banner h2 {{
      font-size: 19px;
      font-weight: 900;
      color: var(--primary);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .highlight-list {{
      list-style: none;
    }}
    .highlight-list li {{
      position: relative;
      padding-left: 20px;
      margin-bottom: 8px;
      font-size: 15px;
      line-height: 1.6;
    }}
    .highlight-list li::before {{
      content: "⚡";
      position: absolute;
      left: 0;
      top: 0;
      font-size: 13px;
    }}

    /* 分類導覽與卡片區 */
    .section-title {{
      font-size: 20px;
      font-weight: 900;
      color: var(--primary-dark);
      margin: 32px 0 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .cards-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
    }}
    .card {{
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      box-shadow: var(--shadow);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }}
    .card-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }}
    .badge {{
      font-size: 12px;
      font-weight: 800;
      padding: 3px 10px;
      border-radius: 999px;
    }}
    .badge-respiratory {{ background: #e6f7ff; color: #0050b3; }}
    .badge-foodborne {{ background: #fff7e6; color: #d46b08; }}
    .badge-vectorborne {{ background: #f6ffed; color: #389e0d; }}
    .badge-special {{ background: #fff0f6; color: #c41d7f; }}
    .date-tag {{ font-size: 13px; color: var(--ink-muted); font-weight: 600; }}
    .disease-name {{
      font-size: 20px;
      font-weight: 900;
      color: var(--primary);
      margin-bottom: 12px;
      line-height: 1.3;
    }}
    .card-body p {{
      margin-bottom: 10px;
      font-size: 14px;
      line-height: 1.6;
    }}
    .status-box {{
      background: #f8faf9;
      padding: 10px;
      border-radius: 6px;
    }}
    .alert-box {{
      background: var(--danger-bg);
      border-left: 3px solid var(--danger-border);
      padding: 8px 10px;
      border-radius: 4px;
      color: #5c0011;
    }}
    .action-box {{
      background: var(--primary-light);
      padding: 8px 10px;
      border-radius: 4px;
      color: var(--primary-dark);
    }}
    .km-link {{
      display: inline-block;
      margin-top: 12px;
      font-size: 13px;
      font-weight: 700;
      color: var(--primary);
      text-decoration: none;
      border: 1px dashed var(--primary);
      padding: 6px 12px;
      border-radius: 6px;
      transition: background 0.2s;
    }}
    .km-link:hover {{
      background: var(--primary-light);
    }}

    /* 國際疫情表格 */
    .intl-table-card {{
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow-x: auto;
      box-shadow: var(--shadow);
      margin-top: 16px;
    }}
    table.intl-table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }}
    table.intl-table th, table.intl-table td {{
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid #eef2f0;
    }}
    table.intl-table th {{
      background: #f4f8f6;
      font-weight: 800;
      color: var(--primary-dark);
      white-space: nowrap;
    }}
    .badge-intl {{
      background: #f0f5ff;
      color: #1d39c4;
      font-weight: 700;
      font-size: 12px;
      padding: 3px 8px;
      border-radius: 4px;
      white-space: nowrap;
    }}

    /* 頁尾 */
    .site-footer {{
      margin-top: 48px;
      text-align: center;
      color: var(--ink-muted);
      font-size: 14px;
      border-top: 1px solid var(--border);
      padding-top: 24px;
    }}
  </style>
</head>
<body>

  <header class="site-header">
    <div class="header-inner">
      <div class="brand-bar">
        <span class="brand-title">臺大醫院 感染管制中心 · NTUH INFECTION CONTROL</span>
      </div>
      <h1 class="hero-h1">疫情訊息週報</h1>
      <div class="hero-meta">
        <span class="tag-badge">{current_issue.get('issue_badge', '【最新期】')}</span>
        <span class="tag-range">📅 發布涵蓋：{current_issue.get('issue_range', {}).get('from')} — {current_issue.get('issue_range', {}).get('to')}</span>
      </div>
    </div>
  </header>

  <!-- 最新 3 期快速切換導覽器 -->
  <section class="issues-switcher-bar" aria-label="最新三期疫情訊息切換">
    <div class="switcher-card active">
      <div class="switcher-badge">🌟 本期最新</div>
      <div class="switcher-title">{issues_summary[0]['title']}</div>
    </div>
    <a class="switcher-card" href="history/issue-2026-09-07.html">
      <div class="switcher-badge" style="color:#666;">📂 上期回顧（9/07期）</div>
      <div class="switcher-title">{issues_summary[1]['title']}</div>
    </a>
    <a class="switcher-card" href="history/issue-2026-08-18.html">
      <div class="switcher-badge" style="color:#666;">📂 前期回顧（8/18期）</div>
      <div class="switcher-title">{issues_summary[2]['title']}</div>
    </a>
  </section>

  <main class="main-container">

    <!-- 本期焦點速覽 -->
    <section class="highlight-banner">
      <h2>⚡ 本期焦點速覽</h2>
      <ul class="highlight-list">
        {''.join(f'<li>{hl}</li>' for hl in current_issue.get('highlights', []))}
      </ul>
    </section>

    <!-- 國內焦點疫情 -->
    <h2 class="section-title">🇹🇼 國內焦點疫情與防護重點</h2>
    <div class="cards-grid">
      {domestic_cards_html}
    </div>

    <!-- 國際近 30 日重要疫情 -->
    <h2 class="section-title">🌐 國際近 30 日重要疫情警戒</h2>
    <div class="intl-table-card">
      <table class="intl-table">
        <thead>
          <tr>
            <th style="width: 110px;">公告日期</th>
            <th style="width: 140px;">疾病名稱</th>
            <th style="width: 180px;">流行國家 / 地區</th>
            <th>疫情現況與防護提醒</th>
          </tr>
        </thead>
        <tbody>
          {intl_rows_html}
        </tbody>
      </table>
    </div>

    <footer class="site-footer">
      <p>主辦與維運單位：臺大醫院 感染管制中心（分機：262144）</p>
      <p>本週報資料來源：衛生福利部疾病管制署最新新聞稿及監測統計，供院內同仁臨床防疫參考。</p>
    </footer>
  </main>

</body>
</html>
"""

(BASE_DIR / "web-preview.html").write_text(web_html, encoding="utf-8")
(BASE_DIR / "index.html").write_text(web_html, encoding="utf-8")
(OUTPUT_DIR / "web-preview-updated.html").write_text(web_html, encoding="utf-8")
(OUTPUT_DIR / "issues" / "cdc-weekly-2026-11-03" / "web.html").write_text(web_html, encoding="utf-8")
print("Successfully generated web-preview.html, index.html, and archived web.html!")

# 產生 email-preview.html 電子報
email_html = f"""<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>{SUBJECT}</title>
</head>
<body style="margin:0;padding:20px;background-color:#eef4f1;font-family:'Microsoft JhengHei',Arial,sans-serif;color:#112e24;">
  <table width="680" border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;background:#ffffff;border:2px solid #0f382c;border-radius:12px;padding:24px;">
    <tr>
      <td>
        <div style="background:#b88316;color:#ffffff;display:inline-block;padding:4px 12px;border-radius:12px;font-size:14px;font-weight:900;">{ISSUE_BADGE}</div>
        <h1 style="color:#0f382c;font-size:28px;margin:12px 0 6px;">臺大醫院 疫情訊息週報</h1>
        <p style="color:#4a6358;font-size:14px;margin-bottom:16px;">發布範圍：{current_issue.get('issue_range', {}).get('from')} 至 {current_issue.get('issue_range', {}).get('to')}</p>
        
        <div style="background:#0f382c;color:#ffffff;text-align:center;padding:12px;border-radius:8px;margin-bottom:20px;">
          <a href="{GITHUB_PAGES_URL}" style="color:#ffffff;text-decoration:none;font-weight:900;font-size:16px;">👉 開啟完整網頁互動版（含歷史3期切換）</a>
        </div>

        <h2 style="color:#0f382c;border-left:5px solid #0f382c;padding-left:10px;font-size:18px;">⚡ 本期焦點速覽</h2>
        <ul style="line-height:1.8;font-size:15px;color:#112e24;">
          {''.join(f'<li>{hl}</li>' for hl in current_issue.get('highlights', []))}
        </ul>

        <h2 style="color:#0f382c;border-left:5px solid #0f382c;padding-left:10px;font-size:18px;margin-top:24px;">🇹🇼 國內重點疫情提要</h2>
        <div style="background:#f8faf9;border:1px solid #d4e7df;padding:14px;border-radius:8px;line-height:1.8;font-size:14px;">
          <p><strong>1. 流感：</strong>重症增至 1,800 例、死亡 378 例，H1N1 占九成。公費抗病毒藥延長且免快篩開立。</p>
          <p><strong>2. 腸病毒：</strong>克沙奇 A6、D68 型為主，累計 7 例重症含 1 死。酒精無效，請用漂白水消毒。</p>
          <p><strong>3. M痘：</strong>國內累計 30 例(20本土、10境外)，Ib型家戶傳播力強，符合公費條件請完成2劑。</p>
          <p><strong>4. 登革熱：</strong>本土增至 13 例(高10、彰2、屏1)現群聚！請善用 NS1 快篩(12185C)輔助通報。</p>
        </div>

        <p style="text-align:center;color:#666;font-size:13px;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">臺大醫院 感染管制中心（分機：262144）</p>
      </td>
    </tr>
  </table>
</body>
</html>
"""
(BASE_DIR / "email-preview.html").write_text(email_html, encoding="utf-8")
(OUTPUT_DIR / "email-hosted.html").write_text(email_html, encoding="utf-8")
(OUTPUT_DIR / "paste-email.html").write_text(email_html, encoding="utf-8")
print("Successfully generated email-preview.html and paste-email.html!")
