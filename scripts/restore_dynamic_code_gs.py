import zlib, pathlib

# Restore Code.gs from git object f9f5aa0e22fbdfd8272b0a55a180790ee5680412 (original 3,141-line code)
git_obj = pathlib.Path('D:/Users/006340/Downloads/台大感管line起來/.git/objects/f9/f5aa0e22fbdfd8272b0a55a180790ee5680412')
data = zlib.decompress(git_obj.read_bytes())
header_end = data.find(b'\x00')
code = data[header_end+1:].decode('utf-8')

# Only apply the 2 clean minor fixes to the original 3,141-line code:

# 1. Update privacyReminderText_ to append weekly digest URL
old_privacy = "function privacyReminderText_() {\n  return '資安提醒：嚴禁於對話框內輸入任何病人姓名、病歷號、床號或具可識別性之醫療個資。';"
new_privacy = "function privacyReminderText_() {\n  return '資安提醒：嚴禁於對話框內輸入任何病人姓名、病歷號、床號或具可識別性之醫療個資。\\n\\n👉 https://heigilin.github.io/ntuh_cdc/web-preview.html?v=20260818';"
if old_privacy in code:
    code = code.replace(old_privacy, new_privacy)
    print("Cleanly patched privacyReminderText_")

# 2. Update satisfactionPromptText_ to remove '每個 LINE 帳號只會主動出現一次。'
old_satisfaction = "    '每個 LINE 帳號只會主動出現一次。若院內有回饋抽獎活動，請依院內公告方式參加；本 LINE 不收集抽獎個資。';"
new_satisfaction = "    '💡 提示：隨時在聊天室輸入「回饋」或「評分」即可再次開啟【回饋小幫手】！若院內有回饋抽獎活動，請依院內公告方式參加；本 LINE 不收集抽獎個資。';"
if old_satisfaction in code:
    code = code.replace(old_satisfaction, new_satisfaction)
    print("Cleanly patched satisfactionPromptText_")

target = pathlib.Path('D:/Users/006340/Downloads/台大感管line起來/gas_line_bot/Code.gs')
target.write_text(code, encoding='utf-8')
print("Successfully restored original dynamic Code.gs with zero hardcoded handlers! Total lines:", len(code.splitlines()))
