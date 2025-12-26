# PowerShell скрипт для тестирования Music Clips job tracking
# Использование: .\test-music-clips-jobs.ps1

$baseUrl = "https://api.shortsai.ru"  # Замените на ваш URL
$token = "your-auth-token-here"  # Замените на ваш токен авторизации
$channelId = "your-channel-id"  # Замените на ID канала
$userId = "your-user-id"  # Замените на ID пользователя

Write-Host "`n=== Тест 1: POST /api/music-clips/channels/:channelId/runOnce ===" -ForegroundColor Cyan

$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
    "x-user-id" = $userId
}

$body = @{
    userId = $userId
} | ConvertTo-Json

Write-Host "URL: $baseUrl/api/music-clips/channels/$channelId/runOnce" -ForegroundColor Gray
Write-Host "Body:" -ForegroundColor Yellow
Write-Host $body -ForegroundColor Gray

try {
    Write-Host "`nОтправка запроса..." -ForegroundColor Yellow
    
    $response = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/music-clips/channels/$channelId/runOnce" -Headers $headers -Body $body -ErrorAction Stop
    
    Write-Host "`n✓ Успешный ответ (202):" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 10) -ForegroundColor White
    
    if ($response.jobId) {
        $jobId = $response.jobId
        Write-Host "`n✓ Job создан, jobId: $jobId" -ForegroundColor Green
        Write-Host "Stage: $($response.stage)" -ForegroundColor Yellow
        
        Write-Host "`n=== Тест 2: GET /api/music-clips/jobs/:jobId (Polling) ===" -ForegroundColor Cyan
        
        $maxAttempts = 20
        $attempt = 0
        
        while ($attempt -lt $maxAttempts) {
            Start-Sleep -Seconds 3
            $attempt++
            
            Write-Host "`nПопытка $attempt/$maxAttempts..." -ForegroundColor Gray
            
            try {
                $jobResponse = Invoke-RestMethod -Method Get -Uri "$baseUrl/api/music-clips/jobs/$jobId" -Headers @{
                    "Authorization" = "Bearer $token"
                } -ErrorAction Stop
                
                Write-Host "Job Status:" -ForegroundColor Yellow
                Write-Host "  Stage: $($jobResponse.stage)" -ForegroundColor White
                Write-Host "  Progress: $($jobResponse.progressText)" -ForegroundColor White
                Write-Host "  Suno TaskId: $($jobResponse.sunoTaskId)" -ForegroundColor White
                Write-Host "  AudioUrl: $($jobResponse.audioUrl)" -ForegroundColor White
                Write-Host "  Error: $($jobResponse.error)" -ForegroundColor $(if ($jobResponse.error) { "Red" } else { "Gray" })
                Write-Host "  Heartbeat: $($jobResponse.heartbeat.secondsSinceUpdate) сек назад (stale: $($jobResponse.heartbeat.isStale))" -ForegroundColor White
                Write-Host "  Updated: $($jobResponse.updatedAt)" -ForegroundColor Gray
                
                # Проверяем завершение
                if ($jobResponse.stage -eq "STAGE_50_SUNO_SUCCESS") {
                    Write-Host "`n✓ Job завершен успешно!" -ForegroundColor Green
                    break
                } elseif ($jobResponse.stage -eq "STAGE_90_FAILED" -or $jobResponse.stage -eq "STAGE_99_TIMEOUT") {
                    Write-Host "`n✗ Job завершен с ошибкой!" -ForegroundColor Red
                    break
                }
                
                # Проверяем stale
                if ($jobResponse.heartbeat.isStale) {
                    Write-Host "`n⚠ ВНИМАНИЕ: Job не обновлялся >60 сек!" -ForegroundColor Yellow
                }
            } catch {
                Write-Host "✗ Ошибка при проверке статуса:" -ForegroundColor Red
                Write-Host $_.Exception.Message -ForegroundColor Red
            }
        }
        
        if ($attempt -ge $maxAttempts) {
            Write-Host "`n⚠ Достигнут лимит попыток ($maxAttempts)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "`n✗ ОШИБКА: jobId не найден в ответе!" -ForegroundColor Red
    }
    
} catch {
    Write-Host "`n✗ Ошибка:" -ForegroundColor Red
    Write-Host "HTTP Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Message: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host "`nResponse Body:" -ForegroundColor Yellow
        try {
            $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
            Write-Host ($errorBody | ConvertTo-Json -Depth 10) -ForegroundColor Gray
        } catch {
            Write-Host $_.ErrorDetails.Message -ForegroundColor Gray
        }
    }
}

Write-Host "`n=== Тесты завершены ===" -ForegroundColor Cyan
Write-Host "`nПримечания:" -ForegroundColor Yellow
Write-Host "1. Замените `$baseUrl, `$token, `$channelId, `$userId на реальные значения" -ForegroundColor Gray
Write-Host "2. Job должен отвечать < 2 сек на runOnce (202)" -ForegroundColor Gray
Write-Host "3. Статусы обновляются через jobs/:jobId каждые 2-3 сек" -ForegroundColor Gray
Write-Host "4. Если heartbeat.isStale = true, значит job не обновлялся >60 сек" -ForegroundColor Gray

