# PowerShell скрипт для проверки endpoint GET /api/music-clips/jobs/:jobId
# Использование: .\test-music-clips-jobs-endpoint.ps1

$baseUrl = "https://api.shortsai.ru"
$token = "your-auth-token-here"  # Замените на ваш токен
$channelId = "your-channel-id"    # Замените на ID канала
$userId = "your-user-id"          # Замените на ID пользователя

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
Write-Host "Body: $body" -ForegroundColor Gray

try {
    Write-Host "`nОтправка запроса..." -ForegroundColor Yellow
    
    $response = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/music-clips/channels/$channelId/runOnce" -Headers $headers -Body $body -ErrorAction Stop
    
    Write-Host "`n✓ Успешный ответ (202):" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 10) -ForegroundColor White
    
    if ($response.jobId) {
        $jobId = $response.jobId
        Write-Host "`n✓ Job создан, jobId: $jobId" -ForegroundColor Green
        Write-Host "Stage: $($response.stage)" -ForegroundColor Yellow
        
        Write-Host "`n=== Тест 2: GET /api/music-clips/jobs/:jobId ===" -ForegroundColor Cyan
        Write-Host "URL: $baseUrl/api/music-clips/jobs/$jobId" -ForegroundColor Gray
        
        Start-Sleep -Seconds 2
        
        try {
            $jobResponse = Invoke-RestMethod -Method Get -Uri "$baseUrl/api/music-clips/jobs/$jobId" -Headers @{
                "Authorization" = "Bearer $token"
            } -ErrorAction Stop
            
            Write-Host "`n✓ Job статус получен:" -ForegroundColor Green
            Write-Host ($jobResponse | ConvertTo-Json -Depth 10) -ForegroundColor White
            
            Write-Host "`nДетали:" -ForegroundColor Yellow
            Write-Host "  JobId: $($jobResponse.jobId)" -ForegroundColor White
            Write-Host "  Stage: $($jobResponse.stage)" -ForegroundColor White
            Write-Host "  Progress: $($jobResponse.progressText)" -ForegroundColor White
            Write-Host "  Suno TaskId: $($jobResponse.sunoTaskId)" -ForegroundColor White
            Write-Host "  AudioUrl: $($jobResponse.audioUrl)" -ForegroundColor White
            Write-Host "  Error: $($jobResponse.error)" -ForegroundColor $(if ($jobResponse.error) { "Red" } else { "Gray" })
            Write-Host "  Heartbeat: $($jobResponse.heartbeat.secondsSinceUpdate) сек назад (stale: $($jobResponse.heartbeat.isStale))" -ForegroundColor White
            
        } catch {
            Write-Host "`n✗ Ошибка при получении статуса job:" -ForegroundColor Red
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
        
        Write-Host "`n=== Тест 3: GET /api/music-clips/jobs/:jobId (несуществующий job) ===" -ForegroundColor Cyan
        $fakeJobId = "job_9999999999999_fake"
        Write-Host "URL: $baseUrl/api/music-clips/jobs/$fakeJobId" -ForegroundColor Gray
        
        try {
            $fakeResponse = Invoke-RestMethod -Method Get -Uri "$baseUrl/api/music-clips/jobs/$fakeJobId" -Headers @{
                "Authorization" = "Bearer $token"
            } -ErrorAction Stop
            
            Write-Host "`n⚠ ОШИБКА: Несуществующий job вернул успешный ответ!" -ForegroundColor Red
        } catch {
            $statusCode = $_.Exception.Response.StatusCode.value__
            if ($statusCode -eq 404) {
                Write-Host "`n✓ Корректно вернул 404 для несуществующего job" -ForegroundColor Green
                if ($_.ErrorDetails.Message) {
                    $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
                    Write-Host "Response:" -ForegroundColor Yellow
                    Write-Host ($errorBody | ConvertTo-Json -Depth 10) -ForegroundColor White
                }
            } else {
                Write-Host "`n✗ Ожидался 404, но получили: $statusCode" -ForegroundColor Red
            }
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
Write-Host "2. Endpoint должен быть доступен по пути: GET /api/music-clips/jobs/:jobId" -ForegroundColor Gray
Write-Host "3. При 404 должен возвращаться JSON с error: 'JOB_NOT_FOUND'" -ForegroundColor Gray

