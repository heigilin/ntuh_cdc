$ErrorActionPreference = "Stop"

$BaseDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$HtmlPath = Join-Path $BaseDir "output\email-hosted.html"
$IssuePath = Join-Path $BaseDir "data\current_issue.json"

if (-not (Test-Path -LiteralPath $HtmlPath)) {
  throw "Hosted email HTML not found: $HtmlPath"
}

$Html = Get-Content -LiteralPath $HtmlPath -Raw -Encoding UTF8
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

try {
  $Outlook = [System.Runtime.InteropServices.Marshal]::GetActiveObject("Outlook.Application")
} catch {
  $Outlook = New-Object -ComObject Outlook.Application
}

$Mail = $Outlook.CreateItem(0)
$Mail.Subject = $Subject
$Mail.To = "inq36@ntuh.gov.tw"
$Mail.HTMLBody = $Html
$Mail.Save()
$Mail.Display($true)
