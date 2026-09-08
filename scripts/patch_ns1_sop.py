import pathlib

target = pathlib.Path('D:/Users/006340/Downloads/台大感管line起來/gas_line_bot/Code.gs')
code = target.read_text(encoding='utf-8')

# Add dengueNs1WorkflowReply_ function and handle 'NS1開方' in handleTextMessage or specialCaseReply_
ns1_fn = """
function dengueNs1WorkflowReply_() {
  return '🏥 【登革熱住院病人 NS1 開方流程 SOP】\\n\\n' +
    '依院內「登革熱住院病人NS1開方流程」規範，臨床開方請依以下 4 步驟執行：\\n\\n' +
    '1️⃣ 適用對象評估：\\n' +
    '   - 住院或急診留觀病人，具登革熱疑似症狀（發燒、頭痛、後眼窩痛、肌肉關節痛、皮疹）或具流行地區 TOCC 暴露史者。\\n\\n' +
    '2️⃣ HIS 系統開立檢體與防蚊醫囑：\\n' +
    '   - NS1 快篩醫令碼：12185C（登革熱 NS1 抗原快速診斷試劑）。\\n' +
    '   - 防蚊隔離醫囑碼：ANN00049（防蚊隔離）。\\n' +
    '   *注意：開立 ANN00049 後，系統將啟動防蚊提示，護理端需提供掛蚊帳、噴抹防蚊液及病室防蚊措施，防止院內蚊媒叮咬二次傳播。\\n\\n' +
    '3️⃣ 通報與防疫檢體送驗：\\n' +
    '   - 若 NS1 快篩結果為陽性（或高度懷疑），醫師需於 HIS 開立 ICD-10 診斷碼 A90 (登革熱) 或 A91 (登革出血熱)，並於 24 小時內完成法定傳染病通報。\\n' +
    '   - 採集血清/血液檢體走院內檢體流程，由檢醫部轉東址檢體受理處，由感管中心送疾病管制署檢驗。\\n\\n' +
    '4️⃣ 解除隔離與取消醫囑：\\n' +
    '   - 病人符合解隔條件（退燒、症狀改善且經過發病傳染期）時，醫師需開立 ANN10049 取消「標準防護-防蚊隔離」以取消特殊註記。\\n\\n' +
    '📄 院內完整文件備查：Y:\\\\IFC_V\\\\50300\\\\感管組\\\\登革熱住院病人NS1開方流程.pdf\\n\\n' +
    '👉 https://heigilin.github.io/ntuh_cdc/web-preview.html?v=20260818';
}
"""

old_handle = "  // 4. 關鍵字：TOCC / 通報"
new_handle = """  // NS1 開方專屬回答
  if (text.includes('NS1') || text.includes('ns1') || text.includes('NA1') || text.includes('na1')) {
    if (text.includes('開方') || text.includes('流程') || text.includes('住院')) {
      replyText = dengueNs1WorkflowReply_();
      replyMessage(replyToken, [{ type: 'text', text: replyText }]);
      return;
    }
  }

  // 4. 關鍵字：TOCC / 通報"""

if old_handle in code:
    code = code.replace(old_handle, new_handle)
    print("Patched handleTextMessage for NS1开方")

code += "\n" + ns1_fn

target.write_text(code, encoding='utf-8')
print("Successfully updated Code.gs with NS1 SOP! Total lines:", len(code.splitlines()))
