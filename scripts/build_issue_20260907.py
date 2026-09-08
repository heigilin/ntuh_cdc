#!/usr/bin/env python3
import json
import base64
import io
import subprocess
from pathlib import Path
from PIL import Image

BASE_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = BASE_DIR / "output"
DATA_DIR = BASE_DIR / "data"

OUTPUT_DIR.mkdir(exist_ok=True)
ISSUE_DATE = "2026-09-07"
ISSUE_RANGE = "2026-08-24 - 2026-09-07"
ISSUE_BADGE = "【2026年9月第1週 · 最新期】"
SUBJECT = "疫情訊息- 【9/07最新期】流感疫情防範；新冠與腸病毒動態；登革熱防護"
GITHUB_PAGES_URL = "https://heigilin.github.io/ntuh_cdc/web-preview.html?v=20260907"

# 1. New Issue Data for 2026-09-07
issue_data = {
  "generated_at": "2026-09-07T08:40:00+08:00",
  "issue_range": {
    "from": "2026-08-24",
    "to": "2026-09-07"
  },
  "display_date": "2026-09-07",
  "organization": "臺大醫院 感染管制中心",
  "title": "疫情訊息",
  "issue_badge": ISSUE_BADGE,
  "tags": [
    "流感",
    "新冠疫苗",
    "登革熱"
  ],
  "subject": SUBJECT,
  "source_policy": {
    "source": "衛生福利部疾病管制署新聞稿",
    "excluded": "澄清專區，以及疫苗或藥物之澄清新聞、排除事件",
    "rewrite": "個人發言一律轉為機關客觀敘述"
  },
  "sections": [
    {
      "id": "highlights",
      "label": "本期焦點與最新動態",
      "priority": 0,
      "items": [
        {
          "id": "focus-flu",
          "section": "highlights",
          "disease": "流感疫情呈緩升趨勢",
          "title": "以 A 型流感為主，幼童與長者就診率升，加強呼吸道防護。",
          "date": "2026-09-01",
          "summary": "門急診就診人次持續上升，人口密集機構群聚增加，請落實手部衛生與咳嗽禮節。",
          "source_url": "https://www.cdc.gov.tw/Bulletin/Detail/BKmpR5jsioonmVADsZ-4tQ?typeid=9",
          "severity_basis": "門急診就診人次與人口密集機構群聚通報緩升。"
        },
        {
          "id": "focus-covid-vax",
          "section": "highlights",
          "disease": "本季新冠疫苗持續開打中",
          "title": "各縣市合約院所皆可接種，高風險族群請儘速打滿防護。",
          "date": "2026-09-01",
          "summary": "本季疫苗已撥配到位，65歲以上及慢性病高風險者優先接種。",
          "source_url": "https://www.cdc.gov.tw/Bulletin/Detail/rKEajQHrBk-SYtJSD4SB5w?typeid=9",
          "severity_basis": "重症預防疫苗撥配與防護政策最新動向。"
        },
        {
          "id": "focus-dengue",
          "section": "highlights",
          "disease": "登革熱境外移入持續新增",
          "title": "出國防蚊，返國 14 天內有不適症狀速就醫。",
          "date": "2026-08-25",
          "summary": "東南亞疫情上升，降雨後積水增加病媒蚊孳生風險，落實巡倒清刷。",
          "source_url": "https://www.cdc.gov.tw/Bulletin/Detail/Stt8v-QIBqLbCLHgyWPaAg?typeid=9",
          "severity_basis": "境外移入持續新增，病媒風險高。"
        }
      ]
    },
    {
      "id": "respiratory",
      "label": "呼吸道傳染病與疫苗撥配",
      "priority": 1,
      "items": [
        {
          "id": "resp-flu",
          "section": "respiratory",
          "disease": "流感",
          "title": "流感｜國內流感疫情呈緩升趨勢，以 A 型流感為主",
          "date": "2026-09-01",
          "is_new": True,
          "audience": "幼童、65 歲以上長者及人口密集機構照護人員。",
          "actions": [
            "出入醫療照護機構或擁擠場所佩戴口罩，勤洗手。",
            "出現發燒、咳嗽等呼吸道症狀時儘量在家休息，避免外出。",
            "醫療院所及密集機構加強上呼吸道群聚監測與 TOCC 詢問。"
          ],
          "summary": "國內流感疫情近 4 週門急診就診人次持續呈上升趨勢，幼童與長者就診率最高；社區病毒監測以 A 型 H1N1 為主。",
          "details": [
            "群聚疫情方面，近期上呼吸道感染群聚通報數同步增加，流感陽性群聚檢出以 A 型為主，主要集中於人口密集機構。",
            "請同仁照護長者與高風險個案時落實飛沫與接觸防護措施。"
          ],
          "source_url": "https://www.cdc.gov.tw/Bulletin/Detail/BKmpR5jsioonmVADsZ-4tQ?typeid=9",
          "severity_basis": "流感門急診上升且密集機構群聚增加。",
          "suggested_links": {
            "education": {
              "name": "總院-流感暨流行性呼吸道病原（167642）",
              "url": "https://edu.ntuh.gov.tw/course/167642"
            },
            "km": {
              "name": "病毒類呼吸道感染症感染管制措施",
              "url": "https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=55684"
            }
          }
        },
        {
          "id": "resp-covid-vax",
          "section": "respiratory",
          "disease": "新冠 COVID-19 疫苗撥配",
          "title": "新冠 COVID-19 疫苗｜全數撥配到位，符合資格者儘速接種",
          "date": "2026-09-01",
          "is_new": True,
          "audience": "尚未接種本季新冠疫苗者，尤其長者與慢性病高風險族群。",
          "actions": [
            "本季新冠疫苗已全數配送至各縣市合約院所，請符合資格者儘速接種。",
            "有發燒或呼吸道症狀者請先快篩並自主佩戴口罩。",
            "高風險對象若快篩陽性應儘速就醫評估開立抗病毒藥劑。"
          ],
          "summary": "國內新冠疫情持續處流行期；為提升保護力，疾管署已將本季新冠疫苗全數撥配至各縣市供民眾接種。",
          "details": [
            "重症個案仍以 65 歲以上長者及慢性病史者為主，絕大多數未接種本季疫苗。",
            "相關接種院所及公費藥劑合約資訊可查疾管署「流感新冠疫苗及流感藥劑地圖」。"
          ],
          "source_url": "https://www.cdc.gov.tw/Bulletin/Detail/rKEajQHrBk-SYtJSD4SB5w?typeid=9",
          "severity_basis": "新冠流行期重症預防疫苗撥配到位。",
          "suggested_links": {
            "education": {
              "name": "總院-流感暨流行性呼吸道病原（167642）",
              "url": "https://edu.ntuh.gov.tw/course/167642"
            },
            "km": {
              "name": "病毒類呼吸道感染症感染管制措施",
              "url": "https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=55684"
            }
          }
        }
      ]
    },
    {
      "id": "vectorborne",
      "label": "病媒蚊傳染病",
      "priority": 2,
      "items": [
        {
          "id": "vector-dengue",
          "section": "vectorborne",
          "disease": "登革熱",
          "title": "登革熱｜出國防蚊，返國 14 天內有症狀速就醫",
          "date": "2026-08-25",
          "is_new": False,
          "audience": "近期出國旅遊或出差者，尤其前往東南亞、南亞地區。",
          "actions": [
            "出國穿淺色長袖長褲，使用衛福部核可之防蚊液。",
            "返國 14 天內若發燒、頭痛、後眼窩痛或肌肉關節痛，速就醫並告知 TOCC。",
            "落實巡、倒、清、刷，清除積水容器。"
          ],
          "summary": "東南亞登革熱疫情持續上升，境外移入風險高。降雨後積水增加病媒蚊孳生風險，落實積水容器清理與出國防蚊。",
          "details": [
            "入境時如有疑似症狀請主動告知檢疫人員。",
            "醫療人員落實詢問 TOCC，適時使用 NS1 快篩輔助通報。"
          ],
          "source_url": "https://www.cdc.gov.tw/Bulletin/Detail/Stt8v-QIBqLbCLHgyWPaAg?typeid=9",
          "severity_basis": "境外移入持續新增。",
          "suggested_links": {
            "education": {
              "name": "總院-登革熱暨常見病媒蚊傳染病（179101）",
              "url": "https://edu.ntuh.gov.tw/course/179101"
            },
            "km": {
              "name": "感染管制手冊—病媒蚊傳染病感染管制措施",
              "url": "https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=84658"
            }
          }
        }
      ]
    }
  ]
}

# Write current_issue.json
current_issue_path = DATA_DIR / "current_issue.json"
current_issue_path.write_text(json.dumps(issue_data, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Updated {current_issue_path} for date {ISSUE_DATE}")

# 2. Build email-preview.html with solid colors and September 7 dates
email_html_content = f"""<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="x-ua-compatible" content="IE=edge">
  <title>{SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef4f1;font-family:'Microsoft JhengHei',Arial,sans-serif;color:#112e24;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <span style="display:none!important;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">【9/07最新期】流感疫情防範、新冠與腸病毒動態及登革熱防護重點提醒。</span>
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background-color:#eef4f1;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:20px 10px;margin:0;">
        <!--[if mso]><table role="presentation" width="680" border="0" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
        <table role="presentation" width="680" border="0" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px;border-collapse:separate;background-color:#ffffff;border:2px solid #0f382c;border-radius:12px;">
          <!-- Header Banner: Solid Dark Emerald Background with Crisp High-Contrast White Text -->
          <tr>
            <td bgcolor="#0f382c" style="padding:28px 28px 24px 28px;background-color:#0f382c;border-radius:10px 10px 0 0;color:#ffffff;font-family:'Microsoft JhengHei',Arial,sans-serif;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <!-- Solid Gold Eyebrow Badge with High Contrast Text -->
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:0 0 10px 0;">
                      <tr>
                        <td bgcolor="#b88316" style="background-color:#b88316;color:#ffffff;border-radius:16px;padding:5px 14px;font-size:15px;font-weight:900;font-family:'Microsoft JhengHei',Arial,sans-serif;">
                          {ISSUE_BADGE}
                        </td>
                      </tr>
                    </table>
                    
                    <p style="font-size:18px;line-height:1.4;font-weight:800;margin:0 0 6px 0;color:#ffffff;font-family:'Microsoft JhengHei',Arial,sans-serif;">臺大醫院 感染管制中心</p>
                    <h1 style="font-size:36px;line-height:1.2;margin:4px 0 10px 0;color:#ffffff;font-weight:900;font-family:'Microsoft JhengHei',Arial,sans-serif;">疫情訊息週報</h1>
                    
                    <!-- Solid Light Tint Badge for Date Range with Dark High-Contrast Text -->
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:8px 0 0 0;">
                      <tr>
                        <td bgcolor="#ffffff" style="background-color:#ffffff;color:#0f382c;border-radius:6px;padding:6px 12px;font-size:15px;font-weight:900;font-family:'Microsoft JhengHei',Arial,sans-serif;">
                          📅 發布日期：{ISSUE_DATE}（涵蓋 8/24 - 9/07 最新疫情動態）
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding:24px 28px;font-family:'Microsoft JhengHei',Arial,sans-serif;color:#112e24;">
              <p style="font-size:16px;line-height:1.8;color:#0f382c;margin:0 0 16px 0;font-weight:800;">同仁好：本期為您整理 8/24 至 9/07 疾管署最新發布動態。流感疫情呈緩升趨勢，本季新冠疫苗已全數撥配到位，請留意院內防護與通報重點。</p>

              <!-- Web preview button: Point directly to Cache-Busted GitHub Pages URL -->
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px 0;">
                <tr>
                  <td bgcolor="#0f382c" style="background-color:#0f382c;border-radius:8px;padding:12px 16px;text-align:center;">
                    <a href="{GITHUB_PAGES_URL}" target="_blank" rel="noopener" style="display:block;color:#ffffff;text-decoration:none;font-size:16px;line-height:1.45;font-weight:900;">開啟網頁互動版 (切換分頁/詳細內容)</a>
                  </td>
                </tr>
              </table>

              <!-- Section: Highlight Cards -->
              <h2 style="font-size:20px;line-height:1.3;margin:24px 0 14px 0;color:#0f382c;border-left:5px solid #0f382c;padding-left:10px;font-weight:900;">本期焦點與最新動態</h2>
              
              <!-- Highlight Item 1: Flu -->
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;margin:0 0 14px 0;border:1px solid #cce3de;border-radius:8px;background-color:#ffffff;">
                <tr>
                  <td style="padding:16px 18px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">
                      <tr>
                        <td bgcolor="#0f382c" style="background-color:#0f382c;color:#ffffff;border-radius:4px;padding:3px 8px;font-size:13px;font-weight:800;">NEW 9/01最新</td>
                        <td style="width:8px;"></td>
                        <td bgcolor="#e8f5e9" style="background-color:#e8f5e9;color:#0f382c;border-radius:4px;padding:3px 8px;font-size:13px;font-weight:800;">流感</td>
                      </tr>
                    </table>
                    <h3 style="font-size:18px;line-height:1.4;margin:4px 0 8px 0;color:#0f382c;font-weight:900;">國內流感疫情呈緩升趨勢，以 A 型流感為主</h3>
                    <p style="font-size:15px;line-height:1.6;color:#2b4c3f;margin:0 0 8px 0;font-weight:700;">國內流感疫情近 4 週門急診就診人次持續呈上升趨勢，幼童與長者就診率最高；社區病毒監測以 A 型 H1N1 為主。</p>
                  </td>
                </tr>
              </table>

              <!-- Highlight Item 2: COVID Vaccine -->
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;margin:0 0 14px 0;border:1px solid #cce3de;border-radius:8px;background-color:#ffffff;">
                <tr>
                  <td style="padding:16px 18px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">
                      <tr>
                        <td bgcolor="#0f382c" style="background-color:#0f382c;color:#ffffff;border-radius:4px;padding:3px 8px;font-size:13px;font-weight:800;">NEW 9/01最新</td>
                        <td style="width:8px;"></td>
                        <td bgcolor="#e8f5e9" style="background-color:#e8f5e9;color:#0f382c;border-radius:4px;padding:3px 8px;font-size:13px;font-weight:800;">新冠疫苗</td>
                      </tr>
                    </table>
                    <h3 style="font-size:18px;line-height:1.4;margin:4px 0 8px 0;color:#0f382c;font-weight:900;">新冠 COVID-19 疫苗全數撥配到位，符合資格者儘速接種</h3>
                    <p style="font-size:15px;line-height:1.6;color:#2b4c3f;margin:0 0 8px 0;font-weight:700;">國內新冠疫情持續處流行期；為提升保護力，疾管署已將本季新冠疫苗全數撥配至各縣市供民眾接種。</p>
                  </td>
                </tr>
              </table>

              <!-- Highlight Item 3: Dengue -->
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;margin:0 0 20px 0;border:1px solid #cce3de;border-radius:8px;background-color:#ffffff;">
                <tr>
                  <td style="padding:16px 18px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">
                      <tr>
                        <td bgcolor="#e8f5e9" style="background-color:#e8f5e9;color:#0f382c;border-radius:4px;padding:3px 8px;font-size:13px;font-weight:800;">登革熱</td>
                      </tr>
                    </table>
                    <h3 style="font-size:18px;line-height:1.4;margin:4px 0 8px 0;color:#0f382c;font-weight:900;">登革熱｜出國防蚊，返國 14 天內有症狀速就醫</h3>
                    <p style="font-size:15px;line-height:1.6;color:#2b4c3f;margin:0 0 8px 0;font-weight:700;">東南亞登革熱疫情持續上升，境外移入風險高。降雨後積水增加病媒蚊孳生風險，落實積水容器清理與出國防蚊。</p>
                  </td>
                </tr>
              </table>

              <!-- Bottom Footer -->
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-top:2px solid #e0ece6;margin-top:24px;padding-top:16px;">
                <tr>
                  <td style="font-size:14px;line-height:1.6;color:#4a6358;font-weight:700;">
                    <p style="margin:0 0 4px 0;">發布單位：臺大醫院 感染管制中心（電話分機：262144）</p>
                    <p style="margin:0;">本電子報為自動發送，詳情請參考院內感管手冊及網頁互動版。</p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>
"""

email_preview_path = BASE_DIR / "email-preview.html"
email_preview_path.write_text(email_html_content, encoding="utf-8")
print(f"Updated {email_preview_path} for date {ISSUE_DATE}")

# 3. Update web-preview.html date badge
web_preview_path = BASE_DIR / "web-preview.html"
if web_preview_path.exists():
    web_content = web_preview_path.read_text(encoding="utf-8")
    # Replace date badges
    web_content = web_content.replace("2026/08/03 - 2026/08/18 （8/18最新期）", "2026/08/24 - 2026/09/07 （9/07最新期）")
    web_content = web_content.replace("涵蓋 8/03 - 8/18 最新疫情動態", "涵蓋 8/24 - 9/07 最新疫情動態")
    web_content = web_content.replace("發布日期：2026-08-18", "發布日期：2026-09-07")
    web_content = web_content.replace("2026年8月第3週", "2026年9月第1週")
    web_preview_path.write_text(web_content, encoding="utf-8")
    print(f"Updated {web_preview_path} date badges for 2026-09-07")

# 4. Build all output files
subprocess.run(["python", str(BASE_DIR / "scripts" / "build_all_outputs.py")], check=True)
print("Successfully built all outputs for September 7th issue!")
