# Диагностика API с новым токеном
# Выполнить: .\test_diag.ps1

$TOKEN = "eyJhbGciOiJSUzI1NiIsImtpZCI6Ijk4OGQ1YTM3OWI3OGJkZjFlNTBhNDA5MTEzZjJiMGM3NWU0NTJlNDciLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vcHJvbXB0LTZhNGZkIiwiYXVkIjoicHJvbXB0LTZhNGZkIiwiYXV0aF90aW1lIjoxNzY2NDE2MTYwLCJ1c2VyX2lkIjoid0pWV2Y3cXZ1b1hZYVZKU1piRUdwTkhVdHZhMiIsInN1YiI6IndKVldmN3F2dW9YWWFWSlNaYkVHcE5IVXR2YTIiLCJpYXQiOjE3NjY0MTc5ODcsImV4cCI6MTc2NjQyMTU4NywiZW1haWwiOiJob3R3ZWxsLmt6QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJlbWFpbCI6WyJob3R3ZWxsLmt6QGdtYWlsLmNvbSJdfSwic2lnbl9pbl9wcm92aWRlciI6InBhc3N3b3JkIn19.UGxswL08yTdzwz06x23f0bPQKGYXkSchxG5iGDlOoT9Lpg6VsebZQDxGfB1QHk0NqLzSCFrtjo3rggFtYkgreSsyEXdyJNhX1Jj35XoSemYRc8kZ6TGPNBnwhkY5Fxu192qT1lqRgMX-pGnznXNcL86B9R1_YGzkZbJb0NdiGHkUKf0EHAZVd_5QTgSR3YRXxj1Y59dZXOL1KZ6Y7wimcGxVOBVnYsv7OFNGFqT_6Qrg1tte7owB6GqfALDM6JRbgFSiGwlWysQBkkppk_cwSQ3QCAQry3CbZahXnP07nFM6P4_dYA-qOAsc1gz-eN0QFv-sNAhLcInJnamHlB7avg"
$API = "https://api.shortsai.ru"
$CHANNEL_ID = "G8AXDO7PQn8nyU81nmm1"

$headers = @{
    "Authorization" = "Bearer $TOKEN"
    "Content-Type" = "application/json"
}

Write-Host "=== 1. Проверка userId ===" -ForegroundColor Green
$response1 = Invoke-RestMethod -Uri "$API/api/diag/whoami" -Method Get -Headers $headers
$response1 | ConvertTo-Json -Depth 10

Write-Host "`n=== 2. Список каналов ===" -ForegroundColor Green
$response2 = Invoke-RestMethod -Uri "$API/api/diag/channels" -Method Get -Headers $headers
$response2 | ConvertTo-Json -Depth 10

Write-Host "`n=== 3. Проверка канала $CHANNEL_ID ===" -ForegroundColor Green
$response3 = Invoke-RestMethod -Uri "$API/api/diag/channel/$CHANNEL_ID" -Method Get -Headers $headers
$response3 | ConvertTo-Json -Depth 10

Write-Host "`n=== 4. Тест fetchAndSaveToServer ===" -ForegroundColor Green
$body = @{
    channelId = $CHANNEL_ID
    videoTitle = "Test Video"
} | ConvertTo-Json

try {
    $response4 = Invoke-RestMethod -Uri "$API/api/telegram/fetchAndSaveToServer" -Method Post -Headers $headers -Body $body
    $response4 | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Ошибка: $_" -ForegroundColor Red
    $_.Exception.Response | Format-List
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        $reader.DiscardBufferedData()
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body: $responseBody" -ForegroundColor Yellow
    }
}

Write-Host "`n=== 5. Получить логи (выполнить на Synology) ===" -ForegroundColor Cyan
Write-Host "ssh -t adminv@192.168.100.222 `"sudo /usr/local/bin/docker logs --tail 150 shorts-backend 2>&1 | grep -iE 'fetchAndSaveToServer|downloadAndSaveToLocal|error from downloadAndSaveToLocal|CHANNEL_NOT_FOUND|Канал не найден|channel check result|checking channel' | tail -60`""

