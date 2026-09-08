import sys
import subprocess

python_exe = sys.executable
working_dir = "Y:\\IFC_V\\50300\\教學資料\\院內發疫情訊息專用"
script_arg = "scripts/scheduled_auto_send.py"

cmd = [
    "powershell",
    "-Command",
    f"$act = New-ScheduledTaskAction -Execute '{python_exe}' -Argument '{script_arg}' -WorkingDirectory '{working_dir}'; "
    "$trig = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9am; "
    "Register-ScheduledTask -TaskName 'CDC_Weekly_Digest_AutoSend' -Action $act -Trigger $trig -User $env:USERNAME -Force"
]

res = subprocess.run(cmd, capture_output=True, text=True)
print("Return code:", res.returncode)
print("Output:", res.stdout)
if res.stderr:
    print("Error:", res.stderr)
