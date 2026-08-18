$Action = New-ScheduledTaskAction -Execute "python.exe" -Argument "scripts/scheduled_auto_send.py" -WorkingDirectory "Y:\IFC_V\50300\教學資料\疫情訊息"
$Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9am
Register-ScheduledTask -TaskName "CDC_Weekly_Digest_AutoSend" -Action $Action -Trigger $Trigger -User $env:USERNAME -Force
Write-Host "Successfully registered Windows Scheduled Task: CDC_Weekly_Digest_AutoSend"
