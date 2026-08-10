$ErrorActionPreference = "Stop"

$BaseDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$HtmlPath = Join-Path $BaseDir "email-preview.html"
$ImagePath = Join-Path $BaseDir "assets\email-train-preview.jpg"
$IssuePath = Join-Path $BaseDir "data\current_issue.json"
$ContentId = "email-train-preview@ntuh-cdc"

if (-not (Test-Path -LiteralPath $HtmlPath)) {
  throw "Email HTML not found: $HtmlPath"
}

if (-not (Test-Path -LiteralPath $ImagePath)) {
  throw "Inline image not found: $ImagePath"
}

$Html = Get-Content -LiteralPath $HtmlPath -Raw -Encoding UTF8
$Html = $Html.Replace('src="assets/email-train-preview.jpg"', ('src="cid:{0}"' -f $ContentId))
$Subject = "疫情訊息-待審核草稿"
if (Test-Path -LiteralPath $IssuePath) {
  try {
    $Issue = Get-Content -LiteralPath $IssuePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($Issue.subject) {
      $Subject = [string]$Issue.subject
    }
  } catch {
    $Subject = "疫情訊息-待審核草稿"
  }
}

function Get-OutlookApp {
  try {
    $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject("Outlook.Application")
    # Test if app is responsive
    $null = $app.Name
    return $app
  } catch {
    # If active object fails or is unresponsive, create fresh or restart process
    try {
      return New-Object -ComObject Outlook.Application
    } catch {
      Get-Process outlook -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
      return New-Object -ComObject Outlook.Application
    }
  }
}

$Outlook = Get-OutlookApp

try {
  $Mail = $Outlook.CreateItem(0)
} catch {
  # If CreateItem failed due to modal/stuck COM state, restart Outlook
  Get-Process outlook -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  $Outlook = New-Object -ComObject Outlook.Application
  $Mail = $Outlook.CreateItem(0)
}

$Mail.Subject = $Subject
$Mail.To = "inq36@ntuh.gov.tw"
$Mail.HTMLBody = $Html

$Attachment = $Mail.Attachments.Add((Resolve-Path -LiteralPath $ImagePath).Path)
$PropertyAccessor = $Attachment.PropertyAccessor
$PropertyAccessor.SetProperty("http://schemas.microsoft.com/mapi/proptag/0x3712001F", $ContentId)
$PropertyAccessor.SetProperty("http://schemas.microsoft.com/mapi/proptag/0x7FFE000B", $true)

$Mail.Save()
$Mail.Display()
Write-Host "SUCCESS: Saved email to Outlook Drafts folder and displayed preview with inline CID image."
