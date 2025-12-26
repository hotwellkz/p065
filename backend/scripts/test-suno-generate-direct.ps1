# PowerShell скрипт для прямого тестирования Suno API generate endpoint
# Использование: .\test-suno-generate-direct.ps1

$SunoApiKey = $env:SUNO_API_KEY
if (-not $SunoApiKey) {
    Write-Host "Ошибка: SUNO_API_KEY не установлен в переменных окружения" -ForegroundColor Red
    Write-Host "Установите: `$env:SUNO_API_KEY = 'your-api-key'" -ForegroundColor Yellow
    exit 1
}

$BaseUrl = "https://api.sunoapi.org"
$Endpoint = "/api/v1/generate"
$FullUrl = "$BaseUrl$Endpoint"

$Headers = @{
    "Authorization" = "Bearer $SunoApiKey"
    "Content-Type" = "application/json"
}

$Body = @{
    prompt = "test music generation"
    customMode = $false
    instrumental = $false
    model = "V4_5ALL"
} | ConvertTo-Json

Write-Host "=== Тест Suno API Generate ===" -ForegroundColor Cyan
Write-Host "URL: $FullUrl" -ForegroundColor Gray
Write-Host "Method: POST" -ForegroundColor Gray
Write-Host "Headers:" -ForegroundColor Gray
Write-Host "  Authorization: Bearer $($SunoApiKey.Substring(0, [Math]::Min(10, $SunoApiKey.Length)))..." -ForegroundColor Gray
Write-Host "  Content-Type: application/json" -ForegroundColor Gray
Write-Host "Body:" -ForegroundColor Gray
Write-Host $Body -ForegroundColor Gray
Write-Host ""

try {
    Write-Host "Отправка запроса..." -ForegroundColor Yellow
    
    $response = Invoke-RestMethod -Method Post -Uri $FullUrl -Headers $Headers -Body $Body -ErrorAction Stop
    
    Write-Host "`n✅ Успешный ответ:" -ForegroundColor Green
    Write-Host (ConvertTo-Json $response -Depth 10) -ForegroundColor Gray
    
    Write-Host "`n=== Анализ ответа ===" -ForegroundColor Cyan
    
    # Проверяем структуру ответа
    Write-Host "Тип ответа: $($response.GetType().Name)" -ForegroundColor Gray
    if ($response.PSObject.Properties.Name) {
        Write-Host "Ключи в ответе: $($response.PSObject.Properties.Name -join ', ')" -ForegroundColor Gray
    }
    
    # Ищем taskId
    $taskId = $null
    if ($response.data.taskId) {
        $taskId = $response.data.taskId
        Write-Host "✅ taskId найден: $taskId (путь: data.taskId)" -ForegroundColor Green
    } elseif ($response.data.task_id) {
        $taskId = $response.data.task_id
        Write-Host "✅ taskId найден: $taskId (путь: data.task_id)" -ForegroundColor Green
    } elseif ($response.taskId) {
        $taskId = $response.taskId
        Write-Host "✅ taskId найден: $taskId (путь: taskId)" -ForegroundColor Green
    } elseif ($response.task_id) {
        $taskId = $response.task_id
        Write-Host "✅ taskId найден: $taskId (путь: task_id)" -ForegroundColor Green
    } else {
        Write-Host "❌ taskId НЕ найден в ответе!" -ForegroundColor Red
        Write-Host "Полная структура ответа:" -ForegroundColor Yellow
        Write-Host (ConvertTo-Json $response -Depth 10) -ForegroundColor Yellow
    }
    
    # Проверяем code и msg
    if ($response.code) {
        Write-Host "code: $($response.code)" -ForegroundColor Gray
    }
    if ($response.msg) {
        Write-Host "msg: $($response.msg)" -ForegroundColor Gray
    }
    if ($response.message) {
        Write-Host "message: $($response.message)" -ForegroundColor Gray
    }
    
} catch {
    Write-Host "`n❌ Ошибка при запросе:" -ForegroundColor Red
    Write-Host "Сообщение: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $statusDescription = $_.Exception.Response.StatusDescription
        
        Write-Host "`nHTTP Status: $statusCode $statusDescription" -ForegroundColor Red
        
        # Пытаемся прочитать тело ответа
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            $reader.Close()
            
            Write-Host "Response Body:" -ForegroundColor Yellow
            Write-Host $responseBody -ForegroundColor Yellow
            
            # Парсим JSON если возможно
            try {
                $errorData = $responseBody | ConvertFrom-Json
                Write-Host "`nПарсированный JSON:" -ForegroundColor Gray
                Write-Host (ConvertTo-Json $errorData -Depth 10) -ForegroundColor Gray
            } catch {
                Write-Host "Не удалось распарсить как JSON" -ForegroundColor Gray
            }
        } catch {
            Write-Host "Не удалось прочитать response body" -ForegroundColor Gray
        }
    }
    
    exit 1
}

Write-Host "`n=== Тест завершён ===" -ForegroundColor Cyan

