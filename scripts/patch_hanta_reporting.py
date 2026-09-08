import pathlib

target = pathlib.Path('D:/Users/006340/Downloads/台大感管line起來/gas_line_bot/Code.gs')
code = target.read_text(encoding='utf-8')

# 1. Update detectDiseaseInfectionControlSubtopic_ to add 'reporting'
old_subtopic_detect = "function detectDiseaseInfectionControlSubtopic_(question) {\n  const q = String(question || '');"
new_subtopic_detect = "function detectDiseaseInfectionControlSubtopic_(question) {\n  const q = String(question || '');\n  if (/通報|法傳|法定傳染病|怎麼報|如何報|報名/i.test(q) && !/競賽|課程|活動|研習/.test(q)) return 'reporting';"

if old_subtopic_detect in code:
    code = code.replace(old_subtopic_detect, new_subtopic_detect)
    print("Patched detectDiseaseInfectionControlSubtopic_ with 'reporting'")

# 2. Update diseaseSubtopicReply_ to handle subtopic === 'reporting'
old_subtopic_reply = "function diseaseSubtopicReply_(name, profile, subtopic) {\n  const diseaseName = String(name || '該疾病');"
new_subtopic_reply = """function diseaseSubtopicReply_(name, profile, subtopic) {
  const diseaseName = String(name || '該疾病');
  if (subtopic === 'reporting') {
    return diseaseReportingReply_(diseaseName, profile);
  }"""

if old_subtopic_reply in code:
    code = code.replace(old_subtopic_reply, new_subtopic_reply)
    print("Patched diseaseSubtopicReply_ for 'reporting'")

# 3. Add diseaseReportingReply_ function implementation
reporting_fn = """
function diseaseReportingReply_(diseaseName, profile) {
  const isHanta = /漢他/.test(diseaseName);
  const isDengue = /登革/.test(diseaseName);
  const categoryText = isHanta ? '第二類法定傳染病（需 24 小時內通報）' : (isDengue ? '第二類法定傳染病（需 24 小時內通報）' : '法定傳染病');

  let steps = [
    diseaseName + '通報流程請依以下 5 步驟辦理：',
    '',
    '1️⃣ 臨床與 TOCC 研判：',
    '   - 確認是否符合病例定義（' + (isHanta ? '發燒、出血傾向、急性腎衰竭或急性呼吸窘迫症候群' : '發燒、頭痛、後眼窩痛、肌肉關節痛或皮疹') + '）。',
    '   - 詳細詢問 TOCC（' + (isHanta ? '發病前 2~8 週鼠類/排泄物暴露史、環境衛生、旅遊史' : '發病前 14 天國內外流行地區旅遊史與蚊媒暴露史') + '）。',
    '',
    '2️⃣ 院內 HIS 系統開單通報：',
    '   - 開立對應診斷碼後，由診斷畫面進入「法定傳染病通報」。',
    '   - 搜尋並選取「' + diseaseName + '」，完整填寫發病日、就醫日、症狀、旅遊史與暴露史。',
    '',
    '3️⃣ 通報時限規範：',
    '   - ' + diseaseName + ' 屬' + categoryText + '，請於規定時限內完成通報，切勿因病人離境或行程受阻而延誤。',
    '',
    '4️⃣ 防疫檢體採檢與送驗：',
    '   - 依 CDC 規範採集指定檢體（' + (isHanta ? '抽血/血清檢體' : '血清/血液檢體或配合 NS1 快篩') + '）。',
    '   - 開立院內法傳檢驗醫令（不需列印送驗單），檢體送檢醫部抽血櫃檯，經東址檢體受理處由感管中心統一送疾病管制署。',
    '',
    '5️⃣ 補齊病歷與後續監測：',
    '   - 於電子病歷完成病情摘要與紀錄，感染管制中心將依法上傳 CDC 通報系統。',
    '',
    '👉 查看最新疫情與感管重點：https://heigilin.github.io/ntuh_cdc/web-preview.html?v=20260818'
  ];

  return steps.join('\\n');
}
"""

# Append diseaseReportingReply_ to code
code += "\n" + reporting_fn

target.write_text(code, encoding='utf-8')
print("Successfully updated full Code.gs! Total lines:", len(code.splitlines()))
