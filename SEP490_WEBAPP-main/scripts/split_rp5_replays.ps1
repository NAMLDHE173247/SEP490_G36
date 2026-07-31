param(
    [Parameter(Mandatory = $true)]
    [string]$ReportPath,
    [string]$OutputDirectory
)

$resolvedReport = Resolve-Path -LiteralPath $ReportPath -ErrorAction Stop
if (-not $OutputDirectory) {
    $OutputDirectory = Split-Path -Parent $resolvedReport.Path
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

$report = Get-Content -LiteralPath $resolvedReport.Path -Raw | ConvertFrom-Json
foreach ($condition in @('pooled', 'oracle', 'hybrid')) {
    $conditionReport = $report.conditions.$condition
    if (-not $conditionReport) {
        Write-Warning "Skipping $condition because the condition is absent from the report."
        continue
    }

    $conversations = @()
    foreach ($conversation in $conditionReport.conversations) {
        foreach ($run in $conversation.repetitions) {
            $conversations += [pscustomobject]@{
                conversation_id = "$($conversation.conversation_id)-r$($run.repetition)"
                gold_subject = $conversation.gold_subject
                eval_condition = $condition
                replay_turns = $run.replay_turns
            }
        }
    }

    $payload = [pscustomobject]@{
        eval_mode = 'hybrid_router_end_to_end'
        eval_condition = $condition
        conversations = $conversations
    }
    $outputPath = Join-Path $OutputDirectory "rp5-$condition-replay.json"
    $json = $payload | ConvertTo-Json -Depth 30
    [System.IO.File]::WriteAllText($outputPath, $json, [System.Text.UTF8Encoding]::new($false))
    Write-Output "$condition => $outputPath ($($conversations.Count) conversations)"
}
