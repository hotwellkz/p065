#!/bin/bash

# Скрипт для деплоя backend на Google Cloud Run
# Использование: ./deploy-cloud-run.sh [SERVICE_NAME] [REGION] [PROJECT_ID]

set -e

# Параметры по умолчанию
SERVICE_NAME=${1:-"shorts-backend"}
REGION=${2:-"us-central1"}
PROJECT_ID=${3:-""}

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Деплой backend на Google Cloud Run${NC}"
echo ""

# Проверка наличия gcloud CLI
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ Ошибка: gcloud CLI не установлен${NC}"
    echo "Установите: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Проверка авторизации
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo -e "${YELLOW}⚠️  Вы не авторизованы в gcloud${NC}"
    echo "Выполняю: gcloud auth login"
    gcloud auth login
fi

# Установка проекта
if [ -n "$PROJECT_ID" ]; then
    echo -e "${GREEN}📦 Устанавливаю проект: $PROJECT_ID${NC}"
    gcloud config set project "$PROJECT_ID"
else
    CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)
    if [ -z "$CURRENT_PROJECT" ]; then
        echo -e "${RED}❌ Ошибка: проект не установлен${NC}"
        echo "Укажите PROJECT_ID или выполните: gcloud config set project YOUR_PROJECT_ID"
        exit 1
    fi
    echo -e "${GREEN}📦 Использую проект: $CURRENT_PROJECT${NC}"
fi

# Включение необходимых API
echo -e "${GREEN}🔧 Включаю необходимые API...${NC}"
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com

# Переход в директорию backend
cd "$(dirname "$0")"

# Сборка Docker образа
echo -e "${GREEN}🐳 Собираю Docker образ...${NC}"
IMAGE_NAME="gcr.io/$(gcloud config get-value project)/${SERVICE_NAME}"
gcloud builds submit --tag "$IMAGE_NAME"

# Деплой на Cloud Run
echo -e "${GREEN}🚀 Деплою на Cloud Run...${NC}"
echo -e "${YELLOW}⚠️  Убедитесь, что все переменные окружения установлены в Cloud Run!${NC}"
echo ""

# Базовая команда деплоя
DEPLOY_CMD="gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10"

# Проверка наличия переменных окружения в файле .env
if [ -f .env ]; then
    echo -e "${GREEN}📝 Найдены переменные окружения в .env${NC}"
    echo -e "${YELLOW}⚠️  Добавление переменных из .env...${NC}"
    
    # Читаем .env и добавляем переменные
    ENV_VARS=""
    while IFS='=' read -r key value || [ -n "$key" ]; do
        # Пропускаем комментарии и пустые строки
        if [[ $key =~ ^#.*$ ]] || [ -z "$key" ]; then
            continue
        fi
        
        # Убираем пробелы
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)
        
        # Убираем кавычки если есть
        value=$(echo "$value" | sed 's/^"\(.*\)"$/\1/')
        value=$(echo "$value" | sed "s/^'\(.*\)'$/\1/")
        
        if [ -n "$key" ] && [ -n "$value" ]; then
            if [ -z "$ENV_VARS" ]; then
                ENV_VARS="$key=$value"
            else
                ENV_VARS="$ENV_VARS,$key=$value"
            fi
        fi
    done < .env
    
    if [ -n "$ENV_VARS" ]; then
        DEPLOY_CMD="$DEPLOY_CMD --set-env-vars $ENV_VARS"
    fi
else
    echo -e "${YELLOW}⚠️  Файл .env не найден${NC}"
    echo "Создайте .env на основе env.example и добавьте переменные вручную через Cloud Console"
fi

# Выполнение деплоя
eval $DEPLOY_CMD

# Получение URL сервиса
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')

echo ""
echo -e "${GREEN}✅ Деплой завершен успешно!${NC}"
echo -e "${GREEN}🌐 URL сервиса: $SERVICE_URL${NC}"
echo ""
echo -e "${YELLOW}📝 Следующие шаги:${NC}"
echo "1. Проверьте переменные окружения в Cloud Console"
echo "2. Убедитесь, что все секреты установлены правильно"
echo "3. Проверьте работу сервиса: curl $SERVICE_URL/health"
echo ""
echo -e "${YELLOW}💡 Для обновления переменных окружения:${NC}"
echo "gcloud run services update $SERVICE_NAME --region $REGION --update-env-vars KEY=VALUE"



