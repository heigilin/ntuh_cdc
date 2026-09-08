import pathlib

target = pathlib.Path('D:/Users/006340/Downloads/台大感管line起來/gas_line_bot/Code.gs')
code = target.read_text(encoding='utf-8')

# 1. Update privacyReminderText_ to append the latest weekly digest URL
old_privacy = "function privacyReminderText_() {\n  return '資安提醒：嚴禁於對話框內輸入任何病人姓名、病歷號、床號或具可識別性之醫療個資。';"
new_privacy = "function privacyReminderText_() {\n  return '資安提醒：嚴禁於對話框內輸入任何病人姓名、病歷號、床號或具可識別性之醫療個資。\\n\\n👉 https://heigilin.github.io/ntuh_cdc/web-preview.html?v=20260818';"

if old_privacy in code:
    code = code.replace(old_privacy, new_privacy)
    print("Patched privacyReminderText_")

# 2. Update satisfactionPromptText_ to remove '每個 LINE 帳號只會主動出現一次。'
old_satisfaction = "    '每個 LINE 帳號只會主動出現一次。若院內有回饋抽獎活動，請依院內公告方式參加；本 LINE 不收集抽獎個資。';"
new_satisfaction = "    '💡 提示：隨時在聊天室輸入「回饋」或「評分」即可再次開啟【回饋小幫手】！若院內有回饋抽獎活動，請依院內公告方式參加；本 LINE 不收集抽獎個資。';"

if old_satisfaction in code:
    code = code.replace(old_satisfaction, new_satisfaction)
    print("Patched satisfactionPromptText_")

# 3. Update '你可以問什麼' in smallTalkReply_
old_what_can_ask = "  if (/你是誰|可以做什麼|能做什麼|會什麼|怎麼用|使用方式|功能/.test(q)) {\n    return '我是台大感管 LINE 查詢助手，主要協助查院內感染管制知識庫。常見可問：法定傳染病通報、診斷碼與送驗、隔離/解隔、床位與檢查安排、清消濃度、疫區、查核回答重點，以及民眾衛教。';\n  }"
new_what_can_ask = """  if (/你是誰|可以問什麼|能做什麼|會什麼|你可以問|你能做|幫助|說明|功能/.test(q)) {
    return '您好！我是「台大感管LINE起來」AI 助手 🤖\\n我能為您解答感染管制政策、傳染病防護、隔離解隔、清消規範與衛教查詢！\\n\\n📌 常見熱門問題範例：\\n\\n🏥 1. 隔離與解隔規定\\n• 「VRE 解隔要採哪裡？要停什麼藥？」\\n• 「以前有 CRE 紀錄，這次住院可以解隔嗎？」\\n• 「MDRO 病人可以去做 CT 或心導管檢查嗎？」\\n\\n🧼 2. 環境清消與防護裝備\\n• 「漂白水清消濃度要泡多少？」\\n• 「進出呼吸道照護區要戴什麼口罩？」\\n\\n📋 3. 法定傳染病與通報\\n• 「登革熱 通報流程？」\\n• 「流感 採檢送驗注意事項？」\\n\\n👨‍👩‍👧 4. 民眾與家屬衛教\\n• 「探病與陪病時間規定？」\\n• 「流感疫苗與新冠疫苗去哪裡打？」\\n\\n💡 提問小撇步：您可以直接用完整對話發問，或輸入關鍵字組合（例如：VRE 解隔、登革熱 通報）。';
  }"""

if old_what_can_ask in code:
    code = code.replace(old_what_can_ask, new_what_can_ask)
    print("Patched smallTalkReply_ what_can_ask")

target.write_text(code, encoding='utf-8')
print("Successfully patched full Code.gs! Total lines:", len(code.splitlines()))
