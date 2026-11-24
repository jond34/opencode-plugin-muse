# E46: collect the Windows desktop facts a hosted runner cannot show.
#
# Run from a signed-in Windows 11 desktop, from the repo root:
#   pwsh -NoProfile -File scripts/windows/desktop-probe.ps1
#
# Writes scratch/windows-desktop-<timestamp>.json. It does not install Muse,
# change policy, answer UAC, or kill anything it did not start.

[CmdletBinding()]
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Continue"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outPath = Join-Path $RepoRoot "scratch/windows-desktop-$stamp.json"
New-Item -ItemType Directory -Force -Path (Split-Path $outPath) | Out-Null

function Invoke-Captured {
  param([string]$Exe, [string[]]$Arguments)
  $lines = & $Exe @Arguments 2>&1 | Out-String
  [pscustomobject]@{
    exit = $LASTEXITCODE
    output = $lines.Trim()
  }
}

$version = Invoke-Captured "muse" @("--version")
$doctor = Invoke-Captured "bun" @("run", "doctor", "--json")
$echo = Invoke-Captured "muse" @("exec", "--provider", "echo", "--trust-workspace", "ok")

# Job membership for a pid, against any job object (IntPtr.Zero).
$jobCode = @"
using System;
using System.Runtime.InteropServices;
public static class E46JobProbe {
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool IsProcessInJob(IntPtr hProcess, IntPtr hJob, out bool result);
}
"@
try { Add-Type -TypeDefinition $jobCode -ErrorAction Stop } catch { }

function Get-JobMembership {
  param([int]$ProcessId)
  try {
    $process = Get-Process -Id $ProcessId -ErrorAction Stop
    $inJob = $false
    $ok = [E46JobProbe]::IsProcessInJob($process.Handle, [IntPtr]::Zero, [ref]$inJob)
    [pscustomobject]@{ ok = $ok; inJob = $inJob; error = $null }
  } catch {
    [pscustomobject]@{ ok = $false; inJob = $null; error = $_.Exception.Message }
  }
}

$serve = $null
$serveExit = $null
$serveJob = $null
$serveTimedOut = $false
try {
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = "muse"
  $info.Arguments = "serve --trust-workspace"
  $info.WorkingDirectory = $RepoRoot
  $info.UseShellExecute = $false
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.CreateNoWindow = $true
  $serve = New-Object System.Diagnostics.Process
  $serve.StartInfo = $info
  [void]$serve.Start()
  Start-Sleep -Seconds 2
  $serveJob = Get-JobMembership -ProcessId $serve.Id
  $serve.StandardInput.Close()
  $serveTimedOut = -not $serve.WaitForExit(30000)
  if (-not $serveTimedOut) { $serveExit = $serve.ExitCode }
  $stderr = $serve.StandardError.ReadToEnd().Trim()
  $stdout = $serve.StandardOutput.ReadToEnd().Trim()
} catch {
  $serveError = $_.Exception.Message
} finally {
  if ($null -ne $serve -and -not $serve.HasExited) { $serve.Kill() }
}

$record = [ordered]@{
  experiment = "E46"
  date = (Get-Date).ToUniversalTime().ToString("o")
  machine = [ordered]@{
    windows = [System.Environment]::OSVersion.VersionString
    is64 = [System.Environment]::Is64BitOperatingSystem
    user = [System.Environment]::UserName
  }
  muse = $version
  doctor = [ordered]@{ exit = $doctor.exit; output = $doctor.output }
  echo = [ordered]@{ exit = $echo.exit; output = $echo.output }
  serve = [ordered]@{
    pid = if ($null -ne $serve) { $serve.Id } else { $null }
    job = $serveJob
    exit = $serveExit
    timedOut = $serveTimedOut
    stdout = $stdout
    stderr = $stderr
    error = $serveError
  }
  observations = [ordered]@{
    uac = $null
    smartScreen = $null
    signIn = $null
    notes = $null
  }
}

$record | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $outPath
Write-Host "wrote $outPath"
Write-Host "Fill observations.uac/smartScreen/signIn/notes before treating this as the E46 result."
