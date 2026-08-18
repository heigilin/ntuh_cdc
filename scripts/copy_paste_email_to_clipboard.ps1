$ErrorActionPreference = "Stop"

$BaseDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$HtmlPath = Join-Path $BaseDir "output\paste-email.html"

if (-not (Test-Path -LiteralPath $HtmlPath)) {
  throw "Paste email HTML not found: $HtmlPath"
}

$Html = Get-Content -LiteralPath $HtmlPath -Raw -Encoding UTF8

function New-CfHtml([string]$Fragment) {
  $prefix = @"
Version:0.9
StartHTML:0000000000
EndHTML:0000000000
StartFragment:0000000000
EndFragment:0000000000
<!DOCTYPE html><html><body><!--StartFragment-->
"@
  $suffix = @"
<!--EndFragment--></body></html>
"@

  $template = $prefix + $Fragment + $suffix
  $startHtml = [Text.Encoding]::UTF8.GetByteCount($template.Substring(0, $template.IndexOf("<!DOCTYPE html>")))
  $startFragment = [Text.Encoding]::UTF8.GetByteCount($template.Substring(0, $template.IndexOf("<!--StartFragment-->") + "<!--StartFragment-->".Length))
  $endFragment = [Text.Encoding]::UTF8.GetByteCount($template.Substring(0, $template.IndexOf("<!--EndFragment-->")))
  $endHtml = [Text.Encoding]::UTF8.GetByteCount($template)

  $template = $template.Replace("StartHTML:0000000000", ("StartHTML:{0:D10}" -f $startHtml))
  $template = $template.Replace("EndHTML:0000000000", ("EndHTML:{0:D10}" -f $endHtml))
  $template = $template.Replace("StartFragment:0000000000", ("StartFragment:{0:D10}" -f $startFragment))
  $template = $template.Replace("EndFragment:0000000000", ("EndFragment:{0:D10}" -f $endFragment))
  return $template
}

Add-Type -AssemblyName System.Windows.Forms
$Data = New-Object System.Windows.Forms.DataObject
$Data.SetData([System.Windows.Forms.DataFormats]::Html, (New-CfHtml $Html))
$Data.SetData([System.Windows.Forms.DataFormats]::UnicodeText, $Html)
[System.Windows.Forms.Clipboard]::SetDataObject($Data, $true)

Write-Host "SUCCESS: HTML email copied to Windows Clipboard."

# Open browser to display paste-email.html
Start-Process $HtmlPath
Write-Host "Opened $HtmlPath in default browser."
