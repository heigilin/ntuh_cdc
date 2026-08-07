$ErrorActionPreference = "Stop"

$BaseDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$HtmlPath = Join-Path $BaseDir "email-preview.html"
$ImagePath = Join-Path $BaseDir "assets\email-train-preview.jpg"
$ContentId = "email-train-preview@ntuh-cdc"

if (-not (Test-Path -LiteralPath $HtmlPath)) {
  throw "Email HTML not found: $HtmlPath"
}

if (-not (Test-Path -LiteralPath $ImagePath)) {
  throw "Inline image not found: $ImagePath"
}

$Html = Get-Content -LiteralPath $HtmlPath -Raw -Encoding UTF8
$Html = $Html.Replace('src="assets/email-train-preview.jpg"', ('src="cid:{0}"' -f $ContentId))

$Outlook = New-Object -ComObject Outlook.Application
$Mail = $Outlook.CreateItem(0)
$Mail.Subject = "【疫情訊息】本週重點與教育訓練連結"
$Mail.To = "inq36@ntuh.gov.tw"
$Mail.HTMLBody = $Html

$Attachment = $Mail.Attachments.Add((Resolve-Path -LiteralPath $ImagePath).Path)
$PropertyAccessor = $Attachment.PropertyAccessor
$PropertyAccessor.SetProperty("http://schemas.microsoft.com/mapi/proptag/0x3712001F", $ContentId)
$PropertyAccessor.SetProperty("http://schemas.microsoft.com/mapi/proptag/0x7FFE000B", $true)

$Mail.Display()
Write-Host "Opened Outlook preview with CID-embedded image. Review it manually, then click Send in Outlook."
