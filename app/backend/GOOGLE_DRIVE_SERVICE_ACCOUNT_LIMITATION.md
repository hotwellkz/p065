# Ограничение Service Account для Google Drive

## Проблема

Service Accounts **не могут загружать файлы** в обычные папки Google Drive, даже если у них есть права "Редактор". 

Ошибка: `Service Accounts do not have storage quota. Leverage shared drives or use OAuth delegation instead.`

## Почему это происходит

Service Accounts не имеют собственного хранилища в Google Drive. Они могут:
- ✅ Читать файлы из расшаренных папок
- ✅ Создавать папки (но не могут хранить в них файлы)
- ❌ **НЕ МОГУТ** загружать файлы в обычные папки Google Drive

## Решения

### Решение 1: Использовать Shared Drives (Google Workspace)

Если у вас есть Google Workspace:

1. Создайте Shared Drive в Google Workspace
2. Добавьте Service Account в Shared Drive с правами "Content Manager"
3. Загружайте файлы в Shared Drive

**Преимущества:**
- Service Account может загружать файлы
- Централизованное хранилище
- Управление доступом через Workspace

**Недостатки:**
- Требует Google Workspace (платный)
- Нужна настройка Shared Drive

### Решение 2: Использовать OAuth токен пользователя

Загружать файлы от имени пользователя через OAuth:

1. Пользователь авторизуется через Google OAuth
2. Backend получает OAuth токен пользователя
3. Использует токен для загрузки файлов в папки пользователя

**Преимущества:**
- Работает с обычными папками Google Drive
- Не требует Google Workspace
- Файлы загружаются в папки пользователя

**Недостатки:**
- Требует OAuth авторизации пользователя
- Нужно хранить OAuth токены
- Более сложная архитектура

### Решение 3: Domain-wide Delegation (Google Workspace)

Если у вас Google Workspace:

1. Настройте Domain-wide Delegation для Service Account
2. Service Account может действовать от имени пользователей домена
3. Загружайте файлы от имени пользователя

**Преимущества:**
- Service Account может загружать файлы
- Не требует OAuth токенов пользователей

**Недостатки:**
- Требует Google Workspace
- Требует настройки Domain-wide Delegation
- Более сложная настройка

## Текущая ситуация

В вашем случае:
- Папки находятся в личном Google Drive аккаунте (`bibi7475000@gmail.com`)
- Service Account имеет права "Редактор" на папки
- Но Service Account **не может** загружать файлы из-за ограничения квоты

## Рекомендуемое решение

Для вашего случая лучше всего использовать **OAuth токен пользователя**:

1. Пользователь авторизуется через Google OAuth на frontend
2. Frontend отправляет OAuth токен на backend
3. Backend использует токен для загрузки файлов

Это позволит загружать файлы в папки пользователя без ограничений Service Account.

## Временное решение

Пока OAuth не настроен, можно:
1. Использовать Shared Drives (если есть Google Workspace)
2. Или вручную загружать файлы через Google Drive UI

## Следующие шаги

1. Настроить Google OAuth на frontend
2. Получать OAuth токен пользователя
3. Использовать токен для загрузки файлов в Google Drive
4. Хранить токен безопасно (refresh token)


