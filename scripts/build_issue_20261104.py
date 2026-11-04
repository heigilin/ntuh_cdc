# -*- coding: utf-8 -*-
import json
import datetime as dt
from pathlib import Path

BASE_DIR = Path("Y:/IFC_V/50300/教學資料/院內發疫情訊息專用")
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "output"
HISTORY_DIR = BASE_DIR / "history"

DATA_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
HISTORY_DIR.mkdir(exist_ok=True)

# 1. 建立最新期 (2026-11-04) 資料
ISSUE_DATE = "2026-11-04"
ISSUE_BADGE = "【2026年11月 第1期 最新版】"
ISSUE_RANGE = "2026/10/20 - 2026/10/27"
SUBJECT = "疫情訊息 -【最新期】流感流行擴大抗病毒藥延長；M痘Ib型單月新高；伊波拉跨國擴散"
GITHUB_PAGES_URL = f"https://heigilin.github.io/ntuh_cdc/web-preview.html?v={ISSUE_DATE.replace('-', '')}"

latest_issue_data = {
    "generated_at": dt.datetime.now().isoformat(),
    "display_date": ISSUE_DATE,
    "issue_badge": ISSUE_BADGE,
    "issue_range": {"from": "2026-10-20", "to": "2026-10-27"},
    "organization": "臺大醫院 感染管制中心",
    "title": "疫情訊息週報",
    "subject": SUBJECT,
    "summary": "流感疫情持續流行A型H1N1占九成，公費藥劑延長至11/15；M痘Ib型顯著上升單月創新高；伊波拉跨國擴散剛果致死率48.6%列三級警告。",
    "highlights": [
        "國內流感疫情仍處流行期，A型H1N1占93.4%，重症以65歲以上長者及慢性病患為主。",
        "公費流感抗病毒藥劑擴大用藥條件延長至2026年11月15日止，具類流感症狀屬高傳播族群可免快篩開立。",
        "M痘Ib型病毒株病例顯著增加，10月單月確診創新高，累計568例(Ib型30例)，呼籲高風險族群完成2劑疫苗。",
        "腸病毒北部未滿10歲女童重症(克沙奇A6型)已出院，今年累計8重症含1死，教托育機構加強環境漂白水清消。",
        "國際伊波拉疫情擴散，剛果民主共和國累計9,876例、致死率48.6%列三級警告(Warning)，肯亞及奈及利亞現境外移入。"
    ],
    "domestic": [
        {
            "id": "influenza",
            "category": "respiratory",
            "name": "流感 (Influenza)",
            "date": "2026-10-20",
            "status": "第42週門急診101,746人次，新增85例重症及28例死亡，65歲以上長者占69.1%及具慢性病史者占85.2%。社區流行病毒以A型H1N1占93.4%為多。",
            "symptoms": "流感重症常見危險徵兆包括呼吸急促、呼吸困難、發紺、血痰、胸痛、意識改變、低血壓等，應儘速就醫。",
            "transmission": "主要經飛沫傳播，65歲以上長者、慢性病患者、孕婦及幼兒為高風險族群。",
            "action": "延長公費抗病毒藥劑使用期限至11月15日止，具類流感症狀且屬高傳播族群者可不需快篩即開立。呼籲民眾儘速接種疫苗，落實勤洗手、戴口罩及生病在家休息。",
            "km_url": "https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=55684",
            "km_name": "院內病毒類呼吸道感染症感染管制措施"
        },
        {
            "id": "mpox",
            "category": "special",
            "name": "M痘 (Mpox)",
            "date": "2026-10-20",
            "status": "截至10月19日新增52例(41本土、11境外)，累計568例。Ib型檢出30例(22本土、8境外)。全球累計19萬3,009例確定病例及536例死亡。",
            "symptoms": "潛伏期長達21天，症狀包括發燒、淋巴結腫大、皮疹水泡等，Ib型皮疹分布較廣，免疫力不足者如幼童、孕婦或慢性病患者易有重症反應。",
            "transmission": "主要經密切接觸或體液傳播，高風險族群為具不安全性行為者、性交易服務者及多重性伴侶者。",
            "action": "完成2劑疫苗可具9成保護力，僅接種1劑保護力約4至8成。全國327家合作院所提供公費接種，呼籲符合條件者儘速完成2劑接種。",
            "km_url": "https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=157420",
            "km_name": "院內M痘感染管制處置與通報流程"
        },
        {
            "id": "covid19",
            "category": "respiratory",
            "name": "新冠肺炎 (COVID-19)",
            "date": "2026-10-20",
            "status": "第41週新冠門急診就診3,873人次，下降27.7%；近7日新增25例本土重症及5例死亡。本季累計56例重症、6例死亡，變異株以PQ.16.1.1為多。",
            "symptoms": "重症警訊包括呼吸急促、呼吸困難、發紺、血痰、胸痛、意識改變、低血壓等，應儘速就醫。",
            "transmission": "主要經飛沫及近距離接觸傳播，高風險族群為65歲以上長者及慢性病患者。",
            "action": "公費新冠疫苗接種踴躍，呼籲符合資格者儘速接種，並落實手部衛生與咳嗽禮節。接種後可獲健康幣獎勵，鼓勵民眾提升防護力。",
            "km_url": "https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=55684",
            "km_name": "院內病毒類呼吸道感染症感染管制措施"
        },
        {
            "id": "enterovirus",
            "category": "foodborne",
            "name": "腸病毒 (Enterovirus)",
            "date": "2026-10-27",
            "status": "新增1例重症(北部未滿10歲女童感染克沙奇A6型，已出院)。今年累計8例重症(含1例死亡)，社區流行型別以克沙奇A6型為多。",
            "symptoms": "重症前兆包括嗜睡、意識不清、活力不佳、手腳無力、肌抽躍、持續嘔吐、呼吸急促或心跳加快等，應儘速送大醫院治療。",
            "transmission": "腸病毒經糞口途徑傳播，5歲以下嬰幼兒為重症高危險群，校園及托育機構為高風險場域。",
            "action": "酒精乾洗手無效！請家長與教托育機構落實肥皂勤洗手、環境以含氯漂白水清消及保持通風，生病者應在家休息避免傳播。",
            "km_url": "https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=99110",
            "km_name": "院內腸病毒感染管制措施"
        },
        {
            "id": "ebola",
            "category": "special",
            "name": "伊波拉病毒感染 (Ebola)",
            "date": "2026-10-21",
            "status": "肯亞及奈及利亞出現邦迪布焦伊波拉境外移入病例。剛果民主共和國截至10月18日累計9,552例確定、4,602例死亡，致死率48.2%，疫情擴及8省份。",
            "symptoms": "症狀包括發燒、頭痛、肌肉痛、嘔吐、腹瀉、出血傾向及多器官衰竭，病程進展迅速，致死率高。",
            "transmission": "主要經體液接觸傳播，高風險族群為醫療照護人員及具該地區旅遊史者。",
            "action": "維持剛果民主共和國旅遊警示等級第三級警告(Warning)，避免非必要前往。加強急診與門診TOCC詢問及疑似個案動線隔離。",
            "km_url": "https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=157420",
            "km_name": "新興傳染病與伊波拉感染管制規範"
        }
    ],
    "international": [
        {
            "date": "2026-10-27",
            "disease": "伊波拉病毒感染",
            "area": "剛果民主共和國",
            "desc": "截至10/23累計9,876例確定病例、4,803例死亡，致死率48.6%，疫情分佈於8省份，伊圖里省最為嚴峻。近21天仍有50個衛生區通報新增病例，疾管署維持第三級警告(Warning)。"
        },
        {
            "date": "2026-10-20",
            "disease": "登革熱",
            "area": "孟加拉",
            "desc": "截至10/18累計報告11萬2,400例住院病例、348例死亡，疫情集中於達卡等人口密集區，病媒蚊蔓延全國，死亡數顯著高於去年同期，疾管署列旅遊警示第一級(Watch)。"
        },
        {
            "date": "2026-10-27",
            "disease": "新冠併發重症",
            "area": "中國、香港",
            "desc": "全球陽性率第39週為4.7%，中國第42週門急診陽性率2.9%，較前週微降，變異株以PQ.16.1.1及NB.1.8.1為主，韓國疫情亦略升，前往當地請注意個人防護。"
        }
    ]
}

# 儲存 current_issue.json
(DATA_DIR / "current_issue.json").write_text(json.dumps(latest_issue_data, ensure_ascii=False, indent=2), encoding="utf-8")
print("Saved current_issue.json successfully!")
