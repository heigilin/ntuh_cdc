import pathlib

target = pathlib.Path('D:/Users/006340/Downloads/台大感管line起來/gas_line_bot/Code.gs')
code = target.read_text(encoding='utf-8')

# Remove raw Y:\ path in dengueNs1WorkflowReply_
old_sop_line = "📄 院內完整文件備查：Y:\\\\IFC_V\\\\50300\\\\感管組\\\\登革熱住院病人NS1開方流程.pdf"
new_sop_line = "📄 完整規範請參閱院內《登革熱住院病人NS1開方流程》SOP 文件"

if old_sop_line in code:
    code = code.replace(old_sop_line, new_sop_line)
    print("Patched dengueNs1WorkflowReply_ to clean Y:\\ drive path")

target.write_text(code, encoding='utf-8')
print("Updated Code.gs! Total lines:", len(code.splitlines()))
