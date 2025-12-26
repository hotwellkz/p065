# PowerShell скрипт для ручной проверки Suno API
# Использование: .\test-suno-generate-manual.ps1

# Проверяем наличие переменной окружения
if (-not $env:SUNO_API_KEY) {
    Write-Host "ОШИБКА: Установите переменную окружения SUNO_API_KEY" -ForegroundColor Red
    Write-Host "Пример: `$env:SUNO_API_KEY = 'your-api-key-here'" -ForegroundColor Yellow
    exit 1
}

$baseUrl = "https://api.sunoapi.org/api/v1"
$apiKey = $env:SUNO_API_KEY

Write-Host "`n=== Тест 1: POST /api/v1/generate ===" -ForegroundColor Cyan
Write-Host "URL: $baseUrl/generate" -ForegroundColor Gray
Write-Host "API Key: $($apiKey.Substring(0, [Math]::Min(10, $apiKey.Length)))..." -ForegroundColor Gray

# Формируем тело запроса
$body = @{
    prompt = "test music generation"
    customMode = $false
    instrumental = $false
    model = "V4_5ALL"
} | ConvertTo-Json

Write-Host "`nRequest Body:" -ForegroundColor Yellow
Write-Host $body -ForegroundColor Gray

# Заголовки
$headers = @{
    "Authorization" = "Bearer $apiKey"
    "Content-Type" = "application/json"
}

try {
    Write-Host "`nОтправка запроса..." -ForegroundColor Yellow
    
    $response = Invoke-RestMethod -Method Post -Uri "$baseUrl/generate" -Headers $headers -Body $body -ErrorAction Stop
    
    Write-Host "`n✓ Успешный ответ:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 10) -ForegroundColor White
    
    # Проверяем наличие taskId
    $taskId = $response.data.taskId
    if (-not $taskId) {
        $taskId = $response.data.task_id
    }
    if (-not $taskId) {
        $taskId = $response.taskId
    }
    
    if ($taskId) {
        Write-Host "`n✓ taskId найден: $taskId" -ForegroundColor Green
        
        # Тест 2: Проверка статуса
        Write-Host "`n=== Тест 2: GET /api/v1/generate/record-info ===" -ForegroundColor Cyan
        Write-Host "URL: $baseUrl/generate/record-info?taskId=$taskId" -ForegroundColor Gray
        
        Write-Host "`nОжидание 5 секунд перед проверкой статуса..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
        
        try {
            $statusResponse = Invoke-RestMethod -Method Get -Uri "$baseUrl/generate/record-info?taskId=$taskId" -Headers @{ "Authorization" = "Bearer $apiKey" } -ErrorAction Stop
            
            Write-Host "`n✓ Статус задачи:" -ForegroundColor Green
            Write-Host ($statusResponse | ConvertTo-Json -Depth 10) -ForegroundColor White
            
            $status = $statusResponse.data.status
            Write-Host "`nСтатус: $status" -ForegroundColor $(if ($status -eq "SUCCESS") { "Green" } elseif ($status -eq "FAILED") { "Red" } else { "Yellow" })
            
            if ($status -eq "SUCCESS") {
                $audioUrl = $statusResponse.data.response.data[0].audio_url
                if ($audioUrl) {
                    Write-Host "✓ audio_url найден: $audioUrl" -ForegroundColor Green
                } else {
                    Write-Host "⚠ audio_url не найден в ответе" -ForegroundColor Yellow
                }
            }
        } catch {
            Write-Host "`n✗ Ошибка при проверке статуса:" -ForegroundColor Red
            Write-Host $_.Exception.Message -ForegroundColor Red
            if ($_.ErrorDetails.Message) {
                Write-Host $_.ErrorDetails.Message -ForegroundColor Red
            }
        }
    } else {
        Write-Host "`n✗ ОШИБКА: taskId не найден в ответе!" -ForegroundColor Red
        Write-Host "Структура ответа:" -ForegroundColor Yellow
        Write-Host ($response | ConvertTo-Json -Depth 10) -ForegroundColor Gray
    }
    
} catch {
    Write-Host "`n✗ Ошибка при вызове Suno API:" -ForegroundColor Red
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
    
    exit 1
}

Write-Host "`n=== Тест 3: GET /api/v1/get-credits ===" -ForegroundColor Cyan
try {
    $creditsResponse = Invoke-RestMethod -Method Get -Uri "$baseUrl/get-credits" -Headers @{ "Authorization" = "Bearer $apiKey" } -ErrorAction Stop
    
    Write-Host "`n✓ Кредиты:" -ForegroundColor Green
    Write-Host ($creditsResponse | ConvertTo-Json -Depth 10) -ForegroundColor White
    
    $credits = $creditsResponse.data.credits
    if ($credits -le 0) {
        Write-Host "`n⚠ ВНИМАНИЕ: Кредиты = $credits" -ForegroundColor Yellow
    } else {
        Write-Host "`n✓ Кредиты доступны: $credits" -ForegroundColor Green
    }
} catch {
    Write-Host "`n✗ Ошибка при проверке кредитов:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host "`n=== Тесты завершены ===" -ForegroundColor Cyan

