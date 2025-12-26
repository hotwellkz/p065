# PowerShell скрипт для тестирования Suno callback и runOnce
# Использование: .\test-suno-callback.ps1

$baseUrl = "https://api.shortsai.ru"  # Замените на ваш URL
$token = "your-auth-token-here"  # Замените на ваш токен авторизации

Write-Host "`n=== Тест 1: POST /api/music-clips/channels/:channelId/runOnce ===" -ForegroundColor Cyan

# Замените на реальные значения
$channelId = "your-channel-id"
$userId = "your-user-id"

$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
    "x-user-id" = $userId
}

$body = @{
    userId = $userId
} | ConvertTo-Json

Write-Host "URL: $baseUrl/api/music-clips/channels/$channelId/runOnce" -ForegroundColor Gray
Write-Host "Headers:" -ForegroundColor Yellow
$headers | ConvertTo-Json | Write-Host -ForegroundColor Gray
Write-Host "Body:" -ForegroundColor Yellow
Write-Host $body -ForegroundColor Gray

try {
    Write-Host "`nОтправка запроса..." -ForegroundColor Yellow
    
    $response = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/music-clips/channels/$channelId/runOnce" -Headers $headers -Body $body -ErrorAction Stop
    
    Write-Host "`n✓ Успешный ответ:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 10) -ForegroundColor White
    
    if ($response.status -eq "PROCESSING" -and $response.taskId) {
        Write-Host "`n✓ Задача создана, taskId: $($response.taskId)" -ForegroundColor Green
        Write-Host "Используйте GET /api/music-clips/tasks/$($response.taskId) для проверки статуса" -ForegroundColor Yellow
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

Write-Host "`n=== Тест 2: POST /api/music-clips/webhooks/suno/music (Callback) ===" -ForegroundColor Cyan

# Пример callback payload от Suno
$callbackBody = @{
    taskId = "suno_task_test123"
    status = "SUCCESS"
    audio_url = "https://cdn.suno.ai/audio/test123.mp3"
    title = "Test Track"
    duration = 120
} | ConvertTo-Json

Write-Host "URL: $baseUrl/api/music-clips/webhooks/suno/music" -ForegroundColor Gray
Write-Host "Body (пример от Suno):" -ForegroundColor Yellow
Write-Host $callbackBody -ForegroundColor Gray

try {
    Write-Host "`nОтправка тестового callback..." -ForegroundColor Yellow
    
    $callbackHeaders = @{
        "Content-Type" = "application/json"
        "User-Agent" = "SunoAPI/1.0"
    }
    
    $callbackResponse = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/music-clips/webhooks/suno/music" -Headers $callbackHeaders -Body $callbackBody -ErrorAction Stop
    
    Write-Host "`n✓ Callback обработан:" -ForegroundColor Green
    Write-Host ($callbackResponse | ConvertTo-Json -Depth 10) -ForegroundColor White
    
} catch {
    Write-Host "`n✗ Ошибка при обработке callback:" -ForegroundColor Red
    Write-Host "HTTP Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Message: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host "`nResponse Body:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message -ForegroundColor Gray
    }
}

Write-Host "`n=== Тесты завершены ===" -ForegroundColor Cyan
Write-Host "`nПримечания:" -ForegroundColor Yellow
Write-Host "1. Замените `$baseUrl, `$token, `$channelId, `$userId на реальные значения" -ForegroundColor Gray
Write-Host "2. Callback endpoint должен быть доступен публично (HTTPS)" -ForegroundColor Gray
Write-Host "3. Убедитесь, что PUBLIC_BASE_URL настроен в ENV backend" -ForegroundColor Gray

