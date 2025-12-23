# ============================================
# Скрипт деплоя backend на Synology NAS (PowerShell)
# ============================================
# Этот скрипт:
# 1. Собирает проект локально
# 2. Копирует файлы на Synology через SSH/SCP
# 3. Запускает docker compose на Synology
# ============================================

$ErrorActionPreference = "Stop"  # Остановка при любой ошибке

# Функция для вывода ошибок
function Write-Error-Custom {
    param([string]$Message)
    Write-Host "Ошибка: $Message" -ForegroundColor Red
    exit 1
}

# Функция для вывода успешных сообщений
function Write-Success {
    param([string]$Message)
    Write-Host "Успешно: $Message" -ForegroundColor Green
}

# Функция для вывода информационных сообщений
function Write-Info {
    param([string]$Message)
    Write-Host "Инфо: $Message" -ForegroundColor Yellow
}

# Проверка, что скрипт запущен из правильной директории
if (-not (Test-Path "package.json")) {
    Write-Error-Custom "Скрипт должен быть запущен из папки backend (где находится package.json)"
}

# Определение путей
$BackendDir = $PSScriptRoot
$RepoRoot = Split-Path -Parent $BackendDir

Write-Info "Корень репозитория: $RepoRoot"
Write-Info "Папка backend: $BackendDir"

# Загрузка переменных окружения из .env.deploy
$EnvDeployFile = Join-Path $RepoRoot ".env.deploy"

if (-not (Test-Path $EnvDeployFile)) {
    Write-Error-Custom "Файл .env.deploy не найден в корне репозитория ($EnvDeployFile)
Создайте его на основе .env.deploy.example:
  Copy-Item .env.deploy.example .env.deploy
  # Затем отредактируйте .env.deploy и заполните своими значениями"
}

Write-Info "Загружаю переменные из $EnvDeployFile"

# Чтение .env.deploy файла
$envVars = @{}
Get-Content $EnvDeployFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+?)\s*=\s*(.+)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        # Убираем кавычки, если есть
        if ($value -match '^["''](.+)["'']$') {
            $value = $matches[1]
        }
        $envVars[$key] = $value
        Set-Item -Path "env:$key" -Value $value
    }
}

# Проверка обязательных переменных
Write-Info "Проверяю обязательные переменные окружения..."

$requiredVars = @("SYNO_HOST", "SYNO_USER", "SYNO_TARGET_PATH", "BACKEND_PORT")
foreach ($var in $requiredVars) {
    if (-not $envVars.ContainsKey($var) -or [string]::IsNullOrWhiteSpace($envVars[$var])) {
        Write-Error-Custom "$var не задан в .env.deploy"
    }
}

# Установка порта SSH по умолчанию, если не задан
if (-not $envVars.ContainsKey("SYNO_SSH_PORT") -or [string]::IsNullOrWhiteSpace($envVars["SYNO_SSH_PORT"])) {
    $env:SYNO_SSH_PORT = "22"
    $envVars["SYNO_SSH_PORT"] = "22"
}

Write-Success "Все обязательные переменные заданы"
Write-Info "  SYNO_HOST: $($envVars['SYNO_HOST'])"
Write-Info "  SYNO_USER: $($envVars['SYNO_USER'])"
Write-Info "  SYNO_TARGET_PATH: $($envVars['SYNO_TARGET_PATH'])"
Write-Info "  BACKEND_PORT: $($envVars['BACKEND_PORT'])"
Write-Info "  SYNO_SSH_PORT: $($envVars['SYNO_SSH_PORT'])"

# Формирование строки подключения SSH
$SshConnection = "$($envVars['SYNO_USER'])@$($envVars['SYNO_HOST'])"
$SshPort = $envVars['SYNO_SSH_PORT']

# Проверка доступности Synology по SSH
Write-Info "Проверяю доступность Synology по SSH..."

# Проверка наличия SSH клиента
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    Write-Error-Custom "SSH клиент не найден. Установите OpenSSH Client:
  - Windows 10/11: Settings -> Apps -> Optional Features -> OpenSSH Client
  - Или установите Git for Windows, который включает SSH"
}

# Простая проверка подключения
$testConnection = Test-NetConnection -ComputerName $envVars['SYNO_HOST'] -Port $SshPort -WarningAction SilentlyContinue
if (-not $testConnection.TcpTestSucceeded) {
    Write-Error-Custom "Не удалось подключиться к Synology ($($envVars['SYNO_HOST']):$SshPort)
Проверьте:
  - Доступность NAS в сети
  - Правильность IP-адреса (SYNO_HOST)
  - Включен ли SSH на Synology (Control Panel -> Terminal and SNMP -> Enable SSH service)"
}

Write-Success "Подключение к Synology установлено"

# Сборка проекта локально
Write-Info "Собираю проект локально..."
Set-Location $BackendDir

if (-not (Test-Path "package.json")) {
    Write-Error-Custom "package.json не найден в папке backend"
}

Write-Info "Устанавливаю зависимости..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "Ошибка при установке зависимостей"
}

Write-Info "Компилирую TypeScript..."
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "Ошибка при сборке проекта"
}

if (-not (Test-Path "dist")) {
    Write-Error-Custom "Папка dist не создана после сборки. Проверьте ошибки компиляции."
}

Write-Success "Проект успешно собран"

# Создание папки на Synology, если её нет
Write-Info "Создаю папку $($envVars['SYNO_TARGET_PATH']) на Synology (если её нет)..."
$sshCommand = "mkdir -p $($envVars['SYNO_TARGET_PATH'])"
ssh -p $SshPort $SshConnection $sshCommand
if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "Не удалось создать папку на Synology"
}

Write-Success "Папка на Synology готова"

# Копирование файлов на Synology через SCP
Write-Info "Копирую файлы на Synology..."

# Проверка наличия SCP
if (-not (Get-Command scp -ErrorAction SilentlyContinue)) {
    Write-Error-Custom "SCP клиент не найден. Установите OpenSSH Client"
}

# Создаём временный архив для передачи
$TempArchive = Join-Path $env:TEMP "shorts-backend-deploy-$PID.tar.gz"
Write-Info "Создаю временный архив..."

# Используем tar (доступен в Windows 10 1903+)
$excludePatterns = @(
    "node_modules",
    ".git",
    ".env",
    ".env.local",
    ".env.development",
    "tmp",
    "*.log",
    ".DS_Store",
    "dist"  # Исключаем dist, т.к. он будет пересобран в Docker
)

# Создаём список файлов для архивации (исключая ненужные)
$filesToArchive = Get-ChildItem -Path $BackendDir -Recurse | Where-Object {
    $relativePath = $_.FullName.Substring($BackendDir.Length + 1)
    $shouldExclude = $false
    foreach ($pattern in $excludePatterns) {
        if ($relativePath -like "*$pattern*") {
            $shouldExclude = $true
            break
        }
    }
    -not $shouldExclude
}

# Используем 7-Zip или tar для создания архива
if (Get-Command tar -ErrorAction SilentlyContinue) {
    # Windows 10 1903+ имеет встроенный tar
    $tarArgs = @("-czf", $TempArchive)
    foreach ($file in $filesToArchive) {
        $relativePath = $file.FullName.Substring($BackendDir.Length + 1)
        $tarArgs += $relativePath
    }
    Set-Location $BackendDir
    & tar $tarArgs
} elseif (Get-Command 7z -ErrorAction SilentlyContinue) {
    # Используем 7-Zip, если доступен
    $sevenZipArgs = @("a", "-tzip", $TempArchive)
    foreach ($file in $filesToArchive) {
        $relativePath = $file.FullName.Substring($BackendDir.Length + 1)
        $sevenZipArgs += (Join-Path $BackendDir $relativePath)
    }
    & 7z $sevenZipArgs
} else {
    Write-Error-Custom "Не найден tar или 7z для создания архива. Установите один из них или используйте WSL."
}

if (-not (Test-Path $TempArchive)) {
    Write-Error-Custom "Ошибка при создании архива"
}

# Копируем архив на Synology
Write-Info "Копирую архив на Synology..."
$archiveName = Split-Path -Leaf $TempArchive
scp -P $SshPort $TempArchive "${SshConnection}:/tmp/$archiveName"
if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "Ошибка при копировании архива"
}

# Распаковываем архив на Synology
Write-Info "Распаковываю архив на Synology..."
$unpackCommand = "cd $($envVars['SYNO_TARGET_PATH']) && tar -xzf /tmp/$archiveName && rm /tmp/$archiveName"
ssh -p $SshPort $SshConnection $unpackCommand
if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "Ошибка при распаковке архива на Synology"
}

# Удаляем временный архив локально
Remove-Item $TempArchive -Force

Write-Success "Файлы успешно скопированы"

# Копирование .env.production на Synology, если он существует
$envProductionPath = Join-Path $BackendDir ".env.production"
if (Test-Path $envProductionPath) {
    Write-Info "Копирую .env.production на Synology..."
    scp -P $SshPort $envProductionPath "${SshConnection}:$($envVars['SYNO_TARGET_PATH'])/.env.production"
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Ошибка при копировании .env.production"
    }
    Write-Success ".env.production скопирован"
} else {
    Write-Info ".env.production не найден, пропускаю (убедитесь, что переменные окружения настроены)"
}

# Запуск docker compose на Synology
Write-Info "Запускаю docker compose на Synology..."

# Выполняем docker compose up на Synology
Write-Info "Выполняю docker compose up -d --build в $($envVars['SYNO_TARGET_PATH'])..."
$dockerCommand = "cd $($envVars['SYNO_TARGET_PATH']) && docker compose up -d --build"
ssh -p $SshPort $SshConnection $dockerCommand
if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "Ошибка при запуске docker compose на Synology"
}

Write-Success "Docker контейнер успешно запущен на Synology"

# Вывод информации о доступности
Write-Host ""
Write-Success "============================================"
Write-Success "Деплой завершен успешно!"
Write-Success "============================================"
Write-Host ""
Write-Info "Backend доступен по адресу:"
Write-Host "http://$($envVars['SYNO_HOST']):$($envVars['BACKEND_PORT'])" -ForegroundColor Green
Write-Host ""
Write-Info "Проверка работоспособности:"
Write-Host "curl http://$($envVars['SYNO_HOST']):$($envVars['BACKEND_PORT'])/health" -ForegroundColor Green
Write-Host ""
Write-Info "Просмотр логов контейнера:"
Write-Host "ssh $SshConnection 'docker logs -f shorts-backend'" -ForegroundColor Green
Write-Host ""
