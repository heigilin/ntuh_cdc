#!/usr/bin/env python3
import json
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = BASE_DIR / "output"
DATA_DIR = BASE_DIR / "data"

current_issue_path = DATA_DIR / "current_issue.json"
issue = json.loads(current_issue_path.read_text(encoding="utf-8")) if current_issue_path.exists() else {}

web_path = BASE_DIR / "web-preview.html"
if not web_path.exists():
    print(f"Error: {web_path} not found")
    exit(1)

html_content = web_path.read_text(encoding="utf-8")

# Replace Eyebrow Date Range
html_content = re.sub(
    r'<span class="eyebrow">[^<]+</span>',
    f'<span class="eyebrow">2026/08/03 - 2026/08/18 【8/18最新期】</span>',
    html_content,
    count=1
)

# Build Cards for Respiratory Section
respiratory_cards = """          <article class="card" id="disease-flu">
            <div class="card-title-row"><span class="disease-title">流感</span><span class="date-tag">2026-08-11</span></div>
            <h3>國內流感疫情呈緩升趨勢，以 A 型流感為主</h3>
            <p>國內流感疫情自 7 月上旬起逐漸升溫，近 4 週門急診就診人次持續呈上升趨勢，幼童與長者就診率最高；社區病毒監測以 A 型 H1N1 為主。</p>
            <p><strong>哪些人要注意：</strong>幼童、65 歲以上長者及人口密集機構照護人員。</p>
            <ul class="action-list">
              <li>出入醫療照護機構或擁擠場所佩戴口罩，勤洗手。</li>
              <li>出現發燒、咳嗽等呼吸道症狀時儘量在家休息，避免外出。</li>
              <li>醫療院所及密集機構加強上呼吸道群聚監測與 TOCC 詢問。</li>
            </ul>
            <div class="more"><div>
              <h4>群聚與保護提醒</h4>
              <p>近期上呼吸道感染群聚通報數同步增加，流感陽性群聚檢出以 A 型為主，主要集中於人口密集機構。請同仁照護長者與高風險個案時落實飛沫與接觸防護措施。</p>
            </div></div>
            <button class="read" type="button">展開更多內容</button>
            <div class="resource-row"><a data-resource="education" data-topic="流感" href="https://edu.ntuh.gov.tw/course/167642">課程：總院-流感暨流行性呼吸道病原（167642）</a><a data-resource="km" data-topic="流感" href="https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=55684">KM：病毒類呼吸道感染症感染管制措施</a><a href="https://www.cdc.gov.tw/Bulletin/Detail/BKmpR5jsioonmVADsZ-4tQ?typeid=9">CDC 原文</a></div>
          </article>

          <article class="card" id="disease-covid-vax">
            <div class="card-title-row"><span class="disease-title">新冠 COVID-19 疫苗撥配</span><span class="date-tag">2026-08-11</span></div>
            <h3>8/13 起全數撥配到位，符合資格者儘速接種</h3>
            <p>國內新冠疫情持續升溫且處流行期；為提升保護力，疾管署已於 8/13 將本季新冠疫苗全數撥配至各縣市合約院所供民眾接種。</p>
            <p><strong>哪些人要注意：</strong>尚未接種本季新冠疫苗者，尤其長者與慢性病高風險族群。</p>
            <ul class="action-list">
              <li>本季新冠疫苗已於 8/13 全數配送到位，請符合資格者儘速接種。</li>
              <li>有發燒或呼吸道症狀者請先快篩並自主佩戴口罩。</li>
              <li>高風險對象若快篩陽性應儘速就醫評估開立抗病毒藥劑。</li>
            </ul>
            <div class="more"><div>
              <h4>重症預防與查詢</h4>
              <p>重症個案仍以 65 歲以上長者及慢性病史者為主，絕大多數未接種本季疫苗。相關接種院所及公費藥劑合約資訊可查疾管署「流感新冠疫苗及流感藥劑地圖」。</p>
            </div></div>
            <button class="read" type="button">展開更多內容</button>
            <div class="resource-row"><a data-resource="education" data-topic="新冠肺炎" href="https://edu.ntuh.gov.tw/course/167642">課程：總院-流感暨流行性呼吸道病原（167642）</a><a data-resource="km" data-topic="新冠肺炎" href="https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=55684">KM：病毒類呼吸道感染症感染管制措施</a><a href="https://www.cdc.gov.tw/Bulletin/Detail/rKEajQHrBk-SYtJSD4SB5w?typeid=9">CDC 原文</a></div>
          </article>

          <article class="card" id="disease-covid">
            <div class="card-title-row"><span class="disease-title">新冠肺炎</span><span class="date-tag">2026-08-04</span></div>
            <h3>疫情上升且處流行期</h3>
            <p>門急診就診人次持續上升，高齡與慢性病長者仍是重症與死亡主要族群。醫療照護機構、人潮擁擠室內場所建議自主佩戴口罩。</p>
            <p><strong>哪些人要注意：</strong>所有人，尤其65歲以上、慢性病等重症高風險者。</p>
            <ul class="action-list">
              <li>尚未接種本季疫苗者儘快接種，擴大接種措施延長至9/28。</li>
              <li>出入醫療機構、大眾運輸、擁擠室內場所時，自主佩戴口罩並落實手部衛生。</li>
              <li>有症狀可先快篩並儘速就醫，高風險者及早就醫以利評估抗病毒藥物。</li>
            </ul>
            <div class="more"><div>
              <h4>就醫與快篩</h4>
              <p>出現喉嚨痛、咳嗽、鼻塞、流鼻水、發燒、疲倦、頭痛及肌肉痠痛等症狀，可先用家用快篩自我篩檢後儘快就醫，或直接至診所由醫師使用醫用快篩。</p>
            </div></div>
            <button class="read" type="button">展開更多內容</button>
            <div class="resource-row"><a data-resource="education" data-topic="新冠肺炎" href="https://edu.ntuh.gov.tw/course/167642">課程：總院-流感暨流行性呼吸道病原（167642）</a><a data-resource="km" data-topic="新冠肺炎" href="https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=55684">KM：病毒類呼吸道感染症感染管制措施</a><a href="https://www.cdc.gov.tw/Bulletin/Detail/lFK7neXKyk54GdPYg_hNDg?typeid=9">CDC 原文</a></div>
          </article>"""

# Build Cards for Vectorborne Section
vectorborne_cards = """          <article class="card" id="disease-dengue">
            <div class="card-title-row"><span class="disease-title">登革熱</span><span class="date-tag">2026-08-04</span></div>
            <h3>境外移入與群聚風險</h3>
            <p>東南亞、南亞登革熱疫情持續上升，境外感染風險提高。暑假旅遊旺季，加上氣象預測聖嬰現象未來數月可能增強，有利登革熱傳播，境外移入風險加大。</p>
            <p><strong>哪些人要注意：</strong>近期出國者，尤其前往東南亞、南亞；返國14天內出現疑似症狀者。</p>
            <ul class="action-list">
              <li>出國穿淺色長袖長褲，使用含DEET、Picaridin或IR-3535的防蚊液。</li>
              <li>返國14天內若發燒、頭痛、後眼窩痛、肌肉關節痛，速就醫並主動告知旅遊史。</li>
              <li>居家落實「巡、倒、清、刷」清除積水容器，降雨後再巡檢一次。</li>
            </ul>
            <div class="more"><div>
              <h4>入境與醫療通報</h4>
              <p>返國入境如有發燒、頭痛、後眼窩痛、肌肉關節痛等疑似症狀，請主動告知機場檢疫人員；給醫療人員：落實詢問TOCC，適時使用登革熱NS1快篩輔助診斷並及早通報。</p>
            </div></div>
            <button class="read" type="button">展開更多內容</button>
            <div class="resource-row"><a data-resource="education" data-topic="登革熱" href="https://edu.ntuh.gov.tw/course/179101">課程：總院-登革熱暨常見病媒蚊傳染病（179101）</a><a data-resource="km" data-topic="登革熱" href="https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=84658">KM：感染管制手冊—病媒蚊傳染病感染管制措施</a><a href="https://www.cdc.gov.tw/Bulletin/Detail/Stt8v-QIBqLbCLHgyWPaAg?typeid=9">CDC 原文</a></div>
          </article>"""

# Replace Respiratory section cards
resp_pattern = re.compile(
    r'(<section class="section active" data-section="respiratory" id="section-respiratory">\s*<div class="section-head">.*?</div>\s*<div class="cards">)(.*?)(</div>\s*</section>)',
    re.DOTALL
)
html_content = resp_pattern.sub(rf'\1\n{respiratory_cards}\n        \3', html_content)

# Replace Vectorborne section cards
vector_pattern = re.compile(
    r'(<section class="section" data-section="vectorborne" id="section-vectorborne">\s*<div class="section-head">.*?</div>\s*<div class="cards">)(.*?)(</div>\s*</section>)',
    re.DOTALL
)
html_content = vector_pattern.sub(rf'\1\n{vectorborne_cards}\n        \3', html_content)

web_path.write_text(html_content, encoding="utf-8")
print("Updated web-preview.html cards to match 2026-08-18 issue.")
