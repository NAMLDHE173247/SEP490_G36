$file = "d:\Sep_G36\SEP490_G36\SEP490_WEBAPP-main\frontend_v2\src\pages\DataPrepView.tsx"
$lines = [System.IO.File]::ReadAllLines($file)

# Find the hero card line (around line 3054)
$heroLine = -1
for ($i = 3030; $i -lt 3070; $i++) {
    if ($lines[$i] -match "1e293b.*16px.*32px.*fff") {
        $heroLine = $i
        break
    }
}

if ($heroLine -eq -1) {
    Write-Host "Hero card not found!"
    exit 1
}

Write-Host "Found hero card at line $($heroLine + 1)"

$commentLine = $heroLine - 1  # The {/* Hero card */} comment line
$endLine = $heroLine + 23      # The closing </div> of the hero card

Write-Host "Replacing lines $($commentLine + 1) to $($endLine + 1)"

# Build new banner lines
$newBanner = @()
$newBanner += '            {/* Hero card */}'
$newBanner += '            <div style={{ background: ''#ffffff'', border: ''1px solid #e2e8f0'', borderRadius: ''16px'', padding: ''32px'', display: ''flex'', alignItems: ''center'', gap: ''32px'', flexWrap: ''wrap'', boxShadow: ''0 1px 3px rgba(0,0,0,0.06)'' }}>'
$newBanner += '              <div style={{ flex: ''1'', minWidth: ''240px'' }}>'
$newBanner += '                <div style={{ fontSize: ''12px'', fontWeight: ''700'', color: ''#64748b'', textTransform: ''uppercase'', letterSpacing: ''1px'', marginBottom: ''8px'' }}>STAGE 4 — CHỜ STAFF HOÀN THÀNH</div>'
$newBanner += '                <h2 style={{ margin: ''0 0 8px 0'', fontSize: ''22px'', fontWeight: ''800'', color: ''#1e293b'' }}>Đang chờ Staff hoàn thành Stage 3</h2>'
$newBanner += '                <p style={{ margin: 0, fontSize: ''14px'', color: ''#64748b'', lineHeight: ''1.6'' }}>'
$newBanner += '                  Sau khi tất cả Staff nộp đủ số mẫu labeling, hệ thống sẽ tự động giải khoá Stage 4 để chạy AI Judges.'
$newBanner += '                </p>'
$newBanner += '              </div>'
$newBanner += '              <div style={{ display: ''flex'', flexDirection: ''column'', alignItems: ''center'', gap: ''8px'' }}>'
$newBanner += '                <div style={{ position: ''relative'', width: ''100px'', height: ''100px'' }}>'
$newBanner += '                  <svg width="100" height="100" viewBox="0 0 100 100">'
$newBanner += '                    <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="8" />'
$newBanner += '                    <circle cx="50" cy="50" r="42" fill="none" stroke="#4f46e5" strokeWidth="8"'
$newBanner += '                      strokeDasharray={`${(77 / 100) * 264} 264`}'
$newBanner += '                      strokeLinecap="round" transform="rotate(-90 50 50)" />'
$newBanner += '                  </svg>'
$newBanner += '                  <div style={{ position: ''absolute'', inset: 0, display: ''flex'', flexDirection: ''column'', alignItems: ''center'', justifyContent: ''center'' }}>'
$newBanner += '                    <span style={{ fontSize: ''22px'', fontWeight: ''900'', color: ''#1e293b'' }}>77%</span>'
$newBanner += '                    <span style={{ fontSize: ''10px'', color: ''#64748b'' }}>hoàn thành</span>'
$newBanner += '                  </div>'
$newBanner += '                </div>'
$newBanner += '                <span style={{ fontSize: ''12px'', color: ''#64748b'' }}>3 Staff chưa nộp đủ</span>'
$newBanner += '              </div>'
$newBanner += '            </div>'

# Build new file content
$newLines = New-Object System.Collections.ArrayList
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($i -eq $commentLine) {
        foreach ($nl in $newBanner) {
            [void]$newLines.Add($nl)
        }
    }
    elseif ($i -gt $commentLine -and $i -le $endLine) {
        # skip old banner lines
        continue
    }
    else {
        [void]$newLines.Add($lines[$i])
    }
}

[System.IO.File]::WriteAllLines($file, $newLines.ToArray())
Write-Host "Done. New total lines: $($newLines.Count)"

# Also remove duplicate return block
$lines2 = [System.IO.File]::ReadAllLines($file)
$removeStart = -1
$removeEnd = -1
for ($i = 4500; $i -lt $lines2.Length; $i++) {
    if ($lines2[$i].Trim() -eq 'return (' -and $removeStart -eq -1) {
        $removeStart = $i
        Write-Host "First return( at line $($i+1)"
    }
    elseif ($lines2[$i].Trim() -eq 'return (' -and $removeStart -ne -1) {
        $removeEnd = $i - 1
        Write-Host "Second return( at line $($i+1), removing lines $($removeStart+1) to $($removeEnd+1)"
        break
    }
}

if ($removeStart -gt 0 -and $removeEnd -gt $removeStart) {
    $finalLines = New-Object System.Collections.ArrayList
    for ($i = 0; $i -lt $lines2.Length; $i++) {
        if ($i -lt $removeStart -or $i -gt $removeEnd) {
            [void]$finalLines.Add($lines2[$i])
        }
    }
    [System.IO.File]::WriteAllLines($file, $finalLines.ToArray())
    Write-Host "Removed duplicate return block. Final lines: $($finalLines.Count)"
}
else {
    Write-Host "No duplicate return block found (removeStart=$removeStart, removeEnd=$removeEnd)"
}

# Fix encoding issues
$content = [System.IO.File]::ReadAllText($file)
$content = $content -replace 'getStaffPrintitials', 'getStaffInitials'
$content = $content -replace 'Printcrease', 'Increase'
$content = $content -replace 'Printitials', 'Initials'
$content = $content -replace 'setcurrentSubStep5', 'setCurrentSubStep5'
[System.IO.File]::WriteAllText($file, $content)
Write-Host "All encoding fixes applied."
