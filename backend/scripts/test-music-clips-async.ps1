# Тестовый скрипт для проверки асинхронного flow Music Clips
# Использование: .\scripts\test-music-clips-async.ps1 -ChannelId "channel123" -UserId "user123" -BaseUrl "http://localhost:8080"

param(
    [Parameter(Mandatory=$true)]
    [string]$ChannelId,
    
    [Parameter(Mandatory=$true)]
    [string]$UserId,
    
    [string]$BaseUrl = "http://localhost:8080",
    
    [int]$MaxPollAttempts = 30,
    
    [int]$PollIntervalSec = 5
)

$ErrorActionPreference = "Stop"

Write-Host "=== Тест асинхронного flow Music Clips ===" -ForegroundColor Cyan
Write-Host "ChannelId: $ChannelId" -ForegroundColor Gray
Write-Host "UserId: $UserId" -ForegroundColor Gray
Write-Host "BaseUrl: $BaseUrl" -ForegroundColor Gray
Write-Host ""

# Шаг 1: Запуск runOnce
Write-Host "[1/3] Запуск runOnce..." -ForegroundColor Yellow
$runOnceUrl = "$BaseUrl/api/music-clips/channels/$ChannelId/runOnce"
$headers = @{
    "Content-Type" = "application/json"
    "x-user-id" = $UserId
}

try {
    $runOnceResponse = Invoke-RestMethod -Uri $runOnceUrl -Method POST -Headers $headers -Body (@{ userId = $UserId } | ConvertTo-Json)
    
    Write-Host "Ответ runOnce:" -ForegroundColor Green
    $runOnceResponse | ConvertTo-Json -Depth 5 | Write-Host
    
    # Проверяем статус
    if ($runOnceResponse.status -eq "PROCESSING" -and $runOnceResponse.jobId) {
        Write-Host "`n[2/3] Получен jobId: $($runOnceResponse.jobId)" -ForegroundColor Green
        Write-Host "Начинаем polling..." -ForegroundColor Yellow
        
        $jobId = $runOnceResponse.jobId
        $attempt = 0
        $completed = $false
        
        while ($attempt -lt $MaxPollAttempts -and -not $completed) {
            $attempt++
            Write-Host "`nПопытка $attempt/$MaxPollAttempts..." -ForegroundColor Gray
            
            Start-Sleep -Seconds $PollIntervalSec
            
            $statusUrl = "$BaseUrl/api/music-clips/jobs/$jobId"
            try {
                $statusResponse = Invoke-RestMethod -Uri $statusUrl -Method GET -Headers $headers
                
                Write-Host "Статус: $($statusResponse.status)" -ForegroundColor Cyan
                
                if ($statusResponse.status -eq "DONE") {
                    Write-Host "`n[3/3] Генерация завершена!" -ForegroundColor Green
                    Write-Host "audioUrl: $($statusResponse.audioUrl)" -ForegroundColor Green
                    Write-Host "title: $($statusResponse.title)" -ForegroundColor Green
                    Write-Host "duration: $($statusResponse.duration)" -ForegroundColor Green
                    $completed = $true
                } elseif ($statusResponse.status -eq "FAILED") {
                    Write-Host "`n[3/3] Генерация провалилась!" -ForegroundColor Red
                    Write-Host "Ошибка: $($statusResponse.message)" -ForegroundColor Red
                    $completed = $true
                } else {
                    Write-Host "Ожидание завершения..." -ForegroundColor Yellow
                }
            } catch {
                Write-Host "Ошибка при проверке статуса: $_" -ForegroundColor Red
                $_.Exception.Response | Format-List | Out-String | Write-Host
                break
            }
        }
        
        if (-not $completed) {
            Write-Host "`nПревышено максимальное количество попыток ($MaxPollAttempts)" -ForegroundColor Red
        }
    } elseif ($runOnceResponse.success) {
        Write-Host "`n[2/3] Синхронный ответ (генерация завершена сразу)" -ForegroundColor Green
        Write-Host "trackPath: $($runOnceResponse.trackPath)" -ForegroundColor Green
        Write-Host "finalVideoPath: $($runOnceResponse.finalVideoPath)" -ForegroundColor Green
    } else {
        Write-Host "`nОшибка: $($runOnceResponse.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "Ошибка при запуске runOnce:" -ForegroundColor Red
    $_.Exception.Message | Write-Host
    $_.Exception.Response | Format-List | Out-String | Write-Host
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body: $responseBody" -ForegroundColor Red
    }
}

Write-Host "`n=== Тест завершён ===" -ForegroundColor Cyan

