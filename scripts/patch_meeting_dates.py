import pathlib

target = pathlib.Path('D:/Users/006340/Downloads/台大感管line起來/gas_line_bot/Code.gs')
code = target.read_text(encoding='utf-8')

# Add dedicated meeting query handler for '登革熱' and other diseases
meeting_fn = """
function dengueMeetingQueryReply_() {
  return '📅【登革熱】議題曾於以下感管會議中討論與決議：\\n\\n' +
    '1️⃣ 2022年11月03日（111.11.03）感管週會\\n' +
    '   • 討論主題：修訂《感染管制措施手冊》登革熱/屈公病衛教與隔離指引。\\n' +
    '   • 決議重點：依 CDC 最新指引新增防蚊隔離規範；住院重點執行防蚊隔離（醫囑 ANN00049）、病例通報與 NS1 快篩流程。\\n\\n' +
    '2️⃣ 2016年07月14日（105.07.14）感管週會\\n' +
    '   • 討論主題：105 年登革熱疫情流行期應變與 NS1 rapid test 陽性率討論。\\n' +
    '   • 決議重點：落實 NS1 快速抗原檢測與住院防蚊處置。\\n\\n' +
    '3️⃣ 2016年06月16日（105.06.16）感管週會\\n' +
    '   • 討論主題：北市衛生局公告登革熱檢驗項目說明。\\n' +
    '   • 決議重點：說明 NS1、RT-PCR 與 IgG/IgM ELISA 等通報採檢流程。\\n\\n' +
    '4️⃣ 2015年09月17日（104.09.17）感管週會\\n' +
    '   • 討論主題：感管指引修訂與登革熱/屈公病確診處置流程。\\n\\n' +
    '5️⃣ 2011年10月06日（100.10.06）感管週會\\n' +
    '   • 討論主題：院內登革熱病例通報與處置研討。\\n\\n' +
    '👉 https://heigilin.github.io/ntuh_cdc/web-preview.html?v=20260818';
}
"""

old_handle = "  // NS1 開方專屬回答"
new_handle = """  // 會議日期查詢專用回答
  if (text.includes('會議') || text.includes('曾在哪') || text.includes('週會') || text.includes('月會') || text.includes('紀錄') || text.includes('記錄')) {
    if (text.includes('登革')) {
      replyText = dengueMeetingQueryReply_();
      replyMessage(replyToken, [{ type: 'text', text: replyText }]);
      return;
    }
  }

  // NS1 開方專屬回答"""

if old_handle in code:
    code = code.replace(old_handle, new_handle)
    print("Patched handleTextMessage for meeting date query")

code += "\n" + meeting_fn

target.write_text(code, encoding='utf-8')
print("Successfully patched Code.gs for meeting date query! Total lines:", len(code.splitlines()))
