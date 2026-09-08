import pathlib

target = pathlib.Path('D:/Users/006340/Downloads/台大感管line起來/gas_line_bot/Code.gs')
code = target.read_text(encoding='utf-8')

# Update dengueReportingReply_ with diagnosis codes and test order codes
old_dengue_fn = """function dengueReportingReply_() {
  return '登革熱通報可先這樣處理：\\n\\n' +
    '- 先確認是否疑似或符合登革熱通報條件，重點包括發燒、頭痛、後眼窩痛、肌肉關節痛、皮疹、出血傾向、白血球或血小板下降，以及發病日、旅遊史、活動史、蚊媒暴露史與相關檢驗結果。\\n' +
    '- 若已開立登革熱相關診斷碼，從病人診斷畫面進入法定傳染病通報畫面；搜尋或選取「登革熱」，確認通報病名與診斷後儲存。\\n' +
    '- 若尚未有診斷碼，可由病人診斷畫面的行政功能進入通報作業，選取「登革熱」後填寫通報資料。\\n' +
    '- 通報資料請補齊症狀、發病日、就醫日、旅遊史、接觸史、活動地點、居住或停留地等欄位；這些資料會影響衛生單位疫情調查與後續防治。\\n' +
    '- 依通報畫面與院內流程完成 CDC 通報檢驗與防疫檢體送驗；若為住院病人需開立 NS1，請依院內「登革熱住院病人 NS1 開方流程」辦理。\\n' +
    '- 總院目前不須列印送驗單；有醫令碼即可走院內檢體流程，病人至檢醫部抽血櫃檯，檢體由檢醫部轉送至東址檢體受理處，再由感染管制中心依流程將防疫檢體送驗至疾病管制署。\\n' +
    '- 若預設醫令碼未涵蓋要通報的疾病，請依 CDC 網頁指定檢體，點選其他項目的檢體醫令；如此檢體仍可傳送到感染管制中心，再由感管中心送疾管署。\\n' +
    '- 若該疾病需附病情摘要或照片，請完成電子病歷；感染管制中心會依法由電子病歷資料上傳 CDC 通報網站。\\n\\n' +
    '如果同仁問的是「登革熱疫區」而不是通報流程，請改查目前 CDC 旅遊疫情建議；疫區會變動，不要用舊會議紀錄當最新疫區名單。';
}"""

new_dengue_fn = """function dengueReportingReply_() {
  return '登革熱通報流程與診斷碼/採檢醫令請依以下 5 步驟辦理：\\n\\n' +
    '1️⃣ 臨床與 TOCC 研判：\\n' +
    '   - 確認是否符合通報條件（發燒、頭痛、後眼窩痛、肌肉關節痛、皮疹、出血傾向、白血球或血小板下降）。\\n' +
    '   - 詳細詢問發病前 14 天國內外流行地區旅遊史、活動史與蚊媒叮咬史。\\n\\n' +
    '2️⃣ 院內 HIS 診斷碼與通報：\\n' +
    '   - 常用 ICD-10 診斷碼：A90 (登革熱)、A91 (登革出血熱)。\\n' +
    '   - 開立診斷碼後，由診斷畫面進入「法定傳染病通報」，選取「登革熱」，完整填寫發病日、就醫日、旅遊史與活動地點。\\n\\n' +
    '3️⃣ 通報時限規範：\\n' +
    '   - 登革熱屬 第二類法定傳染病（需 24 小時內通報），切勿延誤。\\n\\n' +
    '4️⃣ 採檢醫令與防疫檢體送驗：\\n' +
    '   - NS1 快篩採檢醫令碼：12185C (登革熱 NS1 抗原快速診斷)。\\n' +
    '   - 住院防蚊隔離醫囑：開立 ANN00049 防蚊隔離（解隔開立 ANN10049 取消防蚊隔離）。\\n' +
    '   - 總院不需列印送驗單，有醫令碼即可走院內流程：病人至檢醫部抽血櫃檯採檢，檢體由檢醫部轉東址檢體受理處，由感管中心統一送疾病管制署。\\n\\n' +
    '5️⃣ 電子病歷紀錄：\\n' +
    '   - 完成電子病歷病情摘要，感管中心將依法上傳 CDC 通報網站。\\n\\n' +
    '👉 https://heigilin.github.io/ntuh_cdc/web-preview.html?v=20260818';
}"""

if old_dengue_fn in code:
    code = code.replace(old_dengue_fn, new_dengue_fn)
    print("Patched dengueReportingReply_ with ICD and Order Codes")

target.write_text(code, encoding='utf-8')
print("Successfully patched full Code.gs! Total lines:", len(code.splitlines()))
