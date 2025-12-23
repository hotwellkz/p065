# Скрипт для обновления переменных окружения на Synology
$synologyHost = "adminv@192.168.100.222"
$remotePath = "/volume1/docker/shortsai/backend/.env.production"

# Создаём временный файл с обновлениями
$tempFile = [System.IO.Path]::GetTempFileName()

# Читаем текущий файл
Write-Host "Читаю текущий .env.production с Synology..."
$currentContent = ssh $synologyHost "cat $remotePath"

# Обновляем переменные
$updatedContent = $currentContent -replace 'FRONTEND_ORIGIN=.*', 'FRONTEND_ORIGIN=https://shortsai.ru'
$updatedContent = $updatedContent -replace 'BACKEND_URL=.*', 'BACKEND_URL=https://api.shortsai.ru'

# Добавляем GOOGLE_OAUTH_REDIRECT_URI если его нет
if ($updatedContent -notmatch 'GOOGLE_OAUTH_REDIRECT_URI=') {
    # Добавляем после секции Server Configuration
    $updatedContent = $updatedContent -replace '(FRONTEND_ORIGIN=https://shortsai.ru)', "`$1`n`n# Google OAuth Redirect URI`nGOOGLE_OAUTH_REDIRECT_URI=https://api.shortsai.ru/api/auth/google/callback"
} else {
    $updatedContent = $updatedContent -replace 'GOOGLE_OAUTH_REDIRECT_URI=.*', 'GOOGLE_OAUTH_REDIRECT_URI=https://api.shortsai.ru/api/auth/google/callback'
}

# Сохраняем во временный файл
$updatedContent | Out-File -FilePath $tempFile -Encoding utf8

Write-Host "`nОбновлённое содержимое:"
Write-Host "======================"
Get-Content $tempFile | Select-String -Pattern "FRONTEND_ORIGIN|BACKEND_URL|GOOGLE_OAUTH_REDIRECT_URI"
Write-Host "======================`n"

# Загружаем на Synology
Write-Host "Загружаю обновлённый файл на Synology..."
Get-Content $tempFile | ssh $synologyHost "cat > $remotePath"

# Удаляем временный файл
Remove-Item $tempFile

Write-Host "Готово! Файл обновлён на Synology."
Write-Host "`nНе забудьте перезапустить контейнер:"
Write-Host "ssh $synologyHost 'cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose restart'"

