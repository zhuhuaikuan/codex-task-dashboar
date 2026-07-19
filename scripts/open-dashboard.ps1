param(
  [int]$Port = 57631,
  [string]$HostName = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
$PluginRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ServerScript = Join-Path $PluginRoot "scripts\server.mjs"
$Node = (Get-Command node -ErrorAction Stop).Source
$Url = "http://$HostName`:$Port/"

$Args = @(
  "`"$ServerScript`"",
  "--port",
  "$Port",
  "--host",
  "$HostName"
)

Start-Process -FilePath $Node -ArgumentList $Args -WorkingDirectory $PluginRoot -WindowStyle Hidden | Out-Null
Start-Sleep -Milliseconds 800
Start-Process $Url | Out-Null

Write-Output "Codex Task Dashboard opened at $Url"
