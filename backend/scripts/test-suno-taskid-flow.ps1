# PowerShell скрипт для тестирования Suno API taskId-based flow
# Использование: .\test-suno-taskid-flow.ps1

$SunoApiKey = $env:SUNO_API_KEY
if (-not $SunoApiKey) {
    Write-Host "Ошибка: SUNO_API_KEY не установлен в переменных окружения" -ForegroundColor Red
    Write-Host "Установите: `$env:SUNO_API_KEY = 'your-api-key'" -ForegroundColor Yellow
    exit 1
}

$BaseUrl = "https://api.sunoapi.org"
$Headers = @{
    "Authorization" = "Bearer $SunoApiKey"
    "Content-Type" = "application/json"
}

Write-Host "=== Тест 1: Проверка кредитов ===" -ForegroundColor Cyan
try {
    $creditsResponse = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/v1/get-credits" -Headers $Headers
    Write-Host "Кредиты: $($creditsResponse.credits)" -ForegroundColor Green
    Write-Host "Ответ: $(ConvertTo-Json $creditsResponse -Depth 3)" -ForegroundColor Gray
} catch {
    Write-Host "Ошибка при проверке кредитов: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Response: $($_.Exception.Response)" -ForegroundColor Gray
}

Write-Host "`n=== Тест 2: Создание задачи генерации ===" -ForegroundColor Cyan
$generateBody = @{
    prompt = "test music generation"
    customMode = $false
    instrumental = $false
    model = "V4_5ALL"
} | ConvertTo-Json

try {
    $generateResponse = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/generate" -Headers $Headers -Body $generateBody
    Write-Host "Ответ generate:" -ForegroundColor Green
    Write-Host (ConvertTo-Json $generateResponse -Depth 5) -ForegroundColor Gray
    
    $taskId = $generateResponse.data.taskId
    if (-not $taskId) {
        $taskId = $generateResponse.taskId
    }
    
    if (-not $taskId) {
        Write-Host "Ошибка: taskId не найден в ответе" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "`ntaskId: $taskId" -ForegroundColor Green
} catch {
    Write-Host "Ошибка при создании задачи: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body: $responseBody" -ForegroundColor Gray
    }
    exit 1
}

Write-Host "`n=== Тест 3: Проверка статуса задачи (polling) ===" -ForegroundColor Cyan
$maxAttempts = 20
$pollInterval = 3 # секунды
$attempt = 0

while ($attempt -lt $maxAttempts) {
    Start-Sleep -Seconds $pollInterval
    $attempt++
    
    Write-Host "`nПопытка $attempt/$maxAttempts..." -ForegroundColor Yellow
    
    try {
        $statusResponse = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/v1/generate/record-info?taskId=$taskId" -Headers $Headers
        Write-Host "Статус: $(ConvertTo-Json $statusResponse -Depth 5)" -ForegroundColor Gray
        
        $status = $statusResponse.data.status
        if (-not $status) {
            $status = $statusResponse.data.response.status
        }
        if (-not $status) {
            $status = $statusResponse.status
        }
        
        Write-Host "Статус задачи: $status" -ForegroundColor Cyan
        
        if ($status -eq "SUCCESS") {
            $audioUrl = $statusResponse.data.response.data[0].audio_url
            if (-not $audioUrl) {
                $audioUrl = $statusResponse.data.response.data[0].audioUrl
            }
            if (-not $audioUrl) {
                $audioUrl = $statusResponse.data.data[0].audio_url
            }
            
            Write-Host "`n✅ Генерация завершена успешно!" -ForegroundColor Green
            Write-Host "audioUrl: $audioUrl" -ForegroundColor Green
            Write-Host "Title: $($statusResponse.data.response.data[0].title)" -ForegroundColor Green
            Write-Host "Duration: $($statusResponse.data.response.data[0].duration)" -ForegroundColor Green
            break
        } elseif ($status -eq "FAILED") {
            Write-Host "`n❌ Генерация провалилась" -ForegroundColor Red
            Write-Host "Ошибка: $($statusResponse.data.msg)" -ForegroundColor Red
            break
        } else {
            Write-Host "Генерация ещё выполняется ($status)..." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "Ошибка при проверке статуса: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Response body: $responseBody" -ForegroundColor Gray
        }
    }
}

if ($attempt -ge $maxAttempts) {
    Write-Host "`n⚠️ Превышено время ожидания (timeout)" -ForegroundColor Yellow
    Write-Host "Используйте taskId для последующей проверки: $taskId" -ForegroundColor Yellow
}

Write-Host "`n=== Тест завершён ===" -ForegroundColor Cyan

