# Shimmr installer for Windows.
#
#   irm https://shimmr.dev/install.ps1 | iex
#
# Downloads one archive, checks it against its published checksum, and puts two
# binaries on your machine. Installs per-user by default, so no administrator
# prompt. It never edits your editor config — `shimmr init` does that, after
# showing you what it intends to change.

#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Say  { param([string]$m) Write-Host $m }
function Fail {
    param([string]$m)
    Write-Host ''
    Write-Host "  $m" -ForegroundColor Red
    Write-Host ''
    exit 1
}

$version = if ($env:SHIMMR_VERSION)  { $env:SHIMMR_VERSION }  else { 'latest' }
# Releases are served from object storage rather than from the repository,
# which is private: GitHub release assets 404 for anyone who is not us. This
# script is published beside the archives it fetches.
$baseUrl = if ($env:SHIMMR_BASE_URL) { $env:SHIMMR_BASE_URL } else { 'https://fpxntzwkiepnwsazmaxf.supabase.co/storage/v1/object/public/releases' }
$prefix  = if ($env:SHIMMR_PREFIX)   { $env:SHIMMR_PREFIX }   else { Join-Path $env:LOCALAPPDATA 'Programs\Shimmr' }

# ------------------------------------------------------------------ platform

$arch = switch ($env:PROCESSOR_ARCHITECTURE) {
    'AMD64' { 'amd64' }
    'ARM64' { 'arm64' }
    default { Fail "Shimmr does not have a build for $($env:PROCESSOR_ARCHITECTURE) yet." }
}

# Asset names carry no version, so this is the same whether we are pulling a
# tagged release or whatever "latest" currently points at.
$archive = "shimmr-windows-$arch.zip"
$urlBase = if ($version -eq 'latest') { "$baseUrl/latest/download" } else { "$baseUrl/download/$version" }
$label   = if ($version -eq 'latest') { 'the latest release' } else { $version }

# ------------------------------------------------------------------ download

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("shimmr-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

try {
    Say ''
    Say "  Shimmr - $label, windows/$arch"
    Say ''
    Say '  Downloading...'

    # Progress rendering makes Invoke-WebRequest dramatically slower on a
    # 40 MB download, and this script prints its own progress anyway.
    $oldProgress = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    try {
        try {
            Invoke-WebRequest -Uri "$urlBase/$archive" -OutFile (Join-Path $tmp $archive) -UseBasicParsing
        } catch {
            Fail "Could not download $urlBase/$archive"
        }
        try {
            Invoke-WebRequest -Uri "$urlBase/$archive.sha256" -OutFile (Join-Path $tmp "$archive.sha256") -UseBasicParsing
        } catch {
            Fail 'Could not download the checksum. Refusing to install unverified.'
        }
    } finally {
        $ProgressPreference = $oldProgress
    }

    # The checksum file is written by sha256sum: "<hash>  <filename>".
    $want = ((Get-Content (Join-Path $tmp "$archive.sha256") -Raw).Trim() -split '\s+')[0]
    $got  = (Get-FileHash -Path (Join-Path $tmp $archive) -Algorithm SHA256).Hash

    if ($want -ne $got) {
        Write-Host ''
        Write-Host '  Checksum mismatch. Not installing.' -ForegroundColor Red
        Write-Host "    expected  $want"
        Write-Host "    got       $got"
        Write-Host ''
        Write-Host '  Try again. If it keeps happening, please report it rather than'
        Write-Host '  working around it.'
        exit 1
    }
    Say '  Verified.'

    Expand-Archive -Path (Join-Path $tmp $archive) -DestinationPath $tmp -Force
    $src = Get-ChildItem -Path $tmp -Directory | Where-Object { $_.Name -like 'shimmr-*' } | Select-Object -First 1
    if (-not $src) { Fail 'The archive did not contain what was expected.' }

    # ------------------------------------------------------------- install

    # Both binaries live in one directory on Windows: shimmr looks for
    # shimmr-engine.exe beside itself.
    Say ''
    Say '  Installing:'
    Say "    $prefix\shimmr.exe"
    Say "    $prefix\shimmr-engine.exe"
    Say "    $prefix\LICENSES\"

    New-Item -ItemType Directory -Path $prefix -Force | Out-Null

    # A running MCP server holds its own exe open. Say so plainly rather than
    # letting the copy fail with a bare access-denied.
    foreach ($exe in @('shimmr.exe', 'shimmr-engine.exe')) {
        try {
            Copy-Item -Path (Join-Path $src.FullName $exe) -Destination (Join-Path $prefix $exe) -Force
        } catch {
            Fail "Could not replace $exe. Close any editor using Shimmr and try again."
        }
    }

    $licDest = Join-Path $prefix 'LICENSES'
    if (Test-Path $licDest) { Remove-Item $licDest -Recurse -Force }
    Copy-Item -Path (Join-Path $src.FullName 'LICENSES') -Destination $licDest -Recurse -Force

    # ---------------------------------------------------------------- check

    $shimmr = Join-Path $prefix 'shimmr.exe'
    try {
        $installed = & $shimmr version 2>&1
    } catch {
        Fail 'Installed, but the binary will not run. Please report this.'
    }

    # PATH is the user's, so we only change it when asked. The variable is the
    # only way to opt in through `irm | iex`, where there is no argument list.
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $onPath = $userPath -split ';' | Where-Object { $_.TrimEnd('\') -ieq $prefix.TrimEnd('\') }

    Say ''
    if (-not $onPath) {
        if ($env:SHIMMR_ADD_TO_PATH -eq '1') {
            [Environment]::SetEnvironmentVariable('Path', "$userPath;$prefix", 'User')
            Say "  Added $prefix to your user PATH. Open a new terminal to pick it up."
        } else {
            Say "  $prefix is not on your PATH."
            Say '  Add it with:'
            Say ''
            Say "    [Environment]::SetEnvironmentVariable('Path', `"`$env:Path;$prefix`", 'User')"
            Say ''
            Say '  Or re-run this installer with $env:SHIMMR_ADD_TO_PATH = "1".'
        }
        Say ''
    }

    Say "  Installed $installed."
    Say ''
    Say '  Next:'
    Say '    shimmr signup --email you@company.com --org "Your Co"'
    Say '    shimmr init'
    Say '    shimmr doctor'
    Say ''
    Say '  Licences for everything installed:  shimmr licenses'
    Say ''
}
finally {
    Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
