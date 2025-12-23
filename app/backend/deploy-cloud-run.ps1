# PowerShell скрипт для деплоя backend на Google Cloud Run
# Использование: .\deploy-cloud-run.ps1 [SERVICE_NAME] [REGION] [PROJECT_ID]

param(
    [string]$ServiceName = "shorts-backend",
    [string]$Region = "us-central1",
    [string]$ProjectId = ""
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Деплой backend на Google Cloud Run" -ForegroundColor Green
Write-Host ""

# Проверка наличия gcloud CLI
try {
    $null = gcloud version 2>&1
} catch {
    Write-Host "❌ Ошибка: gcloud CLI не установлен" -ForegroundColor Red
    Write-Host "Установите: https://cloud.google.com/sdk/docs/install"
    exit 1
}

# Проверка авторизации
$activeAccount = gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null
if (-not $activeAccount) {
    Write-Host "⚠️  Вы не авторизованы в gcloud" -ForegroundColor Yellow
    Write-Host "Выполняю: gcloud auth login"
    gcloud auth login
}

# Установка проекта
if ($ProjectId) {
    Write-Host "📦 Устанавливаю проект: $ProjectId" -ForegroundColor Green
    gcloud config set project $ProjectId
} else {
    $currentProject = gcloud config get-value project 2>$null
    if (-not $currentProject) {
        Write-Host "❌ Ошибка: проект не установлен" -ForegroundColor Red
        Write-Host "Укажите PROJECT_ID или выполните: gcloud config set project YOUR_PROJECT_ID"
        exit 1
    }
    Write-Host "📦 Использую проект: $currentProject" -ForegroundColor Green
}

# Включение необходимых API
Write-Host "🔧 Включаю необходимые API..." -ForegroundColor Green
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com

# Переход в директорию backend
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Сборка Docker образа
Write-Host "🐳 Собираю Docker образ..." -ForegroundColor Green
$projectId = gcloud config get-value project
$imageName = "gcr.io/$projectId/$ServiceName"
gcloud builds submit --tag $imageName

# Деплой на Cloud Run
Write-Host "🚀 Деплою на Cloud Run..." -ForegroundColor Green
Write-Host "⚠️  Убедитесь, что все переменные окружения установлены в Cloud Run!" -ForegroundColor Yellow
Write-Host ""

$deployCmd = "gcloud run deploy $ServiceName " +
    "--image $imageName " +
    "--platform managed " +
    "--region $Region " +
    "--allow-unauthenticated " +
    "--port 8080 " +
    "--memory 512Mi " +
    "--cpu 1 " +
    "--timeout 300 " +
    "--max-instances 10"

# Проверка наличия переменных окружения в файле .env
if (Test-Path ".env") {
    Write-Host "📝 Найдены переменные окружения в .env" -ForegroundColor Green
    Write-Host "⚠️  Добавление переменных из .env..." -ForegroundColor Yellow
    
    $envVars = @()
    Get-Content .env | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            if ($line -match "^([^=]+)=(.*)$") {
                $key = $matches[1].Trim()
                $value = $matches[2].Trim()
                # Убираем кавычки если есть
                $value = $value -replace '^["''](.*)["'']$', '$1'
                if ($key -and $value) {
                    $envVars += "$key=$value"
                }
            }
        }
    }
    
    if ($envVars.Count -gt 0) {
        $envVarsString = $envVars -join ","
        $deployCmd += " --set-env-vars $envVarsString"
    }
} else {
    Write-Host "⚠️  Файл .env не найден" -ForegroundColor Yellow
    Write-Host "Создайте .env на основе env.example и добавьте переменные вручную через Cloud Console"
}

# Выполнение деплоя
Invoke-Expression $deployCmd

# Получение URL сервиса
$serviceUrl = gcloud run services describe $ServiceName --region $Region --format 'value(status.url)'

Write-Host ""
Write-Host "✅ Деплой завершен успешно!" -ForegroundColor Green
Write-Host "🌐 URL сервиса: $serviceUrl" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Следующие шаги:" -ForegroundColor Yellow
Write-Host "1. Проверьте переменные окружения в Cloud Console"
Write-Host "2. Убедитесь, что все секреты установлены правильно"
Write-Host "3. Проверьте работу сервиса: curl $serviceUrl/health"
Write-Host ""
Write-Host "💡 Для обновления переменных окружения:" -ForegroundColor Yellow
Write-Host "gcloud run services update $ServiceName --region $Region --update-env-vars KEY=VALUE"



