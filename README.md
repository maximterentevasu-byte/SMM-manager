# smm**platform** — AI-платформа для системного SMM

**Домен:** https://smmplatform.pro  
**Сервер:** `root@178.105.159.177` → `/opt/smm-platform`  
**Бренд:** Platform Blue `#3478F6`, фон `#0D1B2A`, маскот АИСТ  
**Шрифты:** Manrope (заголовки) + Inter (текст)

---

## Стек

| Слой | Технологии |
|------|-----------|
| Backend | FastAPI (async), SQLAlchemy 2.0, PostgreSQL 16, Redis 7, Celery |
| Frontend | Next.js 14 (App Router), TypeScript, inline CSS (без Tailwind) |
| AI | Claude (Anthropic) — тексты/стратегия, Gemini (Google Imagen 3) — картинки |
| Инфраструктура | Docker Compose, Nginx (reverse proxy), Let's Encrypt (SSL) |
| Email | Brevo (основной), Resend (резерв) |
| Аналитика TG | Telethon (MTProto) — сбор статистики канала |
| Аналитика VK | VK API (wall.get) — user token |

---

## Архитектура

```
Nginx (443/80)
  ├── /api/  → backend:8000  (FastAPI, 2 workers)
  └── /      → frontend:3000 (Next.js)

Docker Compose (prod):
  postgres       — БД smm_platform
  redis          — брокер задач + кэш
  backend        — FastAPI API
  celery_worker  — фоновые задачи (concurrency=2)
  celery_beat    — планировщик (cron-задачи)
  frontend       — Next.js SSR
```

---

## Бэкенд

### API роуты (`/api/...`)

| Роут | Описание |
|------|----------|
| `/auth` | Регистрация, логин, logout, верификация email, сброс пароля |
| `/businesses` | CRUD бизнес-профилей |
| `/onboarding` | Онбординг нового бизнеса (AI-стратегия) |
| `/content` | Контент-план: слоты, генерация, согласование |
| `/platforms` | Подключение VK / Telegram / ОК |
| `/subscriptions` | Тарифы, активация демо, вебхук ЮКасса |
| `/analytics` | Аналитика постов и историй VK + Telegram |
| `/post-creator` | Быстрый пост с AI-текстом и картинкой |
| `/events` | Маркетинговые события (акции, ивенты) |
| `/home` | Дашборд: KPI, топ-контент, расписание |
| `/leads` | Лиды с лендинга |

### Модели БД

```
users               — аккаунты (email, пароль, is_verified, tour_completed)
email_verifications — коды верификации/сброса пароля
businesses          — профили бизнесов (profile JSON, strategy JSON)
platform_connections — подключения VK/TG/ОК (токены шифруются Fernet)
content_slots       — посты в контент-плане
events              — маркетинговые события с авто-постами
slot_notifications  — трекинг TG-уведомлений (message_id → slot_id)
subscriptions       — тарифы пользователей
leads               — заявки с лендинга

-- Аналитика:
telegram_posts / telegram_stories
vk_stories
analytics_tg_weekly / analytics_vk_weekly
```

### Статусы контент-слота

```
planned → idea_ready → pending_approval → needs_info → content_ready → published
                                                                      ↘ failed
```

### AI агенты (`/agents`)

| Агент | Назначение |
|-------|-----------|
| `onboarding_agent` | Анализирует бизнес, генерирует стратегию при онбординге |
| `strategy_agent` | Пересчёт/обновление стратегии |
| `planner_agent` | Генерация контент-плана (рубрики + расписание) |
| `copywriter_agent` | Написание текстов постов |
| `image_agent` | Подбор/генерация промптов для картинок |
| `market_research` | Анализ конкурентов и рынка |
| `analytics_context` | AI-сводка по аналитике за период |

### Celery задачи

| Очередь | Задачи |
|---------|--------|
| `generation` | Генерация контент-плана, текстов, картинок |
| `posting` | Автопостинг в VK и Telegram по расписанию |
| `default` | Уведомления (needs_info, согласование), аналитика |
| `celery` | Системные задачи beat |

---

## Мультибизнес

Один аккаунт поддерживает до **3 бизнесов**. Каждый бизнес — независимый профиль со своей стратегией, контент-планом, платформами и аналитикой.

### Переключение
- В сайдбаре (desktop) и мобильном drawer — блок **«Мои бизнесы»** над АИСТ
- Активный бизнес подсвечен синей точкой
- Клик → меняет `localStorage.businessId` + перезагружает `/home`
- Кнопка **+ Добавить бизнес** видна, если бизнесов < 3

### Создание нового бизнеса
1. Кнопка «+ Добавить бизнес» → `/onboarding?new=true`
2. Полный онбординг (профиль → AI-стратегия → рубрики → запуск)
3. После завершения новый бизнес становится активным

### Лимит
- Backend проверяет: не более 3 бизнесов на аккаунт (HTTP 400 при превышении)
- `POST /onboarding/save-profile/new?force_new=true` — всегда создаёт новый бизнес (без антидубль-поиска)

### Заградительный барьер (анти-дубль)
- `save-profile` без `force_new` → **всегда ищет существующий бизнес** пользователя (`ORDER BY created_at DESC`)
- Повторный онбординг N раз = обновление профиля, НЕ создание нового бизнеса
- Frontend layout: если `localStorage.businessId` указывает на удалённый бизнес → автопереключение на первый доступный

---

## Stories Bot

Telegram-бот `@bot_storis_pick_me_bot` — интерфейс публикации историй напрямую из Telegram.

### Бот-флоу
1. `/start` → бот просит указать `@username` канала
2. Бот проверяет канал через `getChat` → ищет в `platform_connections`
3. Бот запрашивает у пользователя разрешение на отправку запроса (показывает `@username`, имя)
4. Пользователь подтверждает → запрос попадает в раздел **Сторис** веб-платформы
5. Владелец одобряет / отклоняет
6. После одобрения: пользователь нажимает «📤 Отправить пост в сторис» и присылает фото
7. Бот публикует фото как историю через Telethon MTProto

### Хранение состояний (`story_bot_sessions`)
| State | Описание |
|-------|----------|
| `waiting_channel` | Пользователь не указал канал |
| `waiting_confirm` | Канал найден, ждёт согласия на отправку запроса |
| `pending_approval` | Запрос на рассмотрении у владельца |
| `active` | Одобрен, может постить |
| `rejected` | Отклонён |

### API
- `POST /api/story-bot/webhook` — webhook от Telegram
- `GET /api/story-bot/info` — username бота
- `GET /api/story-bot/sessions` — список сессий по бизнесам пользователя
- `POST /api/story-bot/approve/{id}` — одобрить + уведомить пользователя в боте
- `POST /api/story-bot/reject/{id}` — отклонить + уведомить
- `DELETE /api/story-bot/session/{id}` — удалить

### .env
```
STORY_BOT_TOKEN=<BotFather token>
```
Webhook регистрируется автоматически при старте бэкенда (если `STORY_BOT_TOKEN` и `DOMAIN` заданы).

### Ежедневный напоминатель (Celery Beat)
- Задача `check_story_reminders` — каждые 20 минут (`crontab minute="0,20,40"`)
- Активна с **12:00 до 23:00 ЕКБ** (UTC+5)
- Для каждого активного `StoryBotSession`: проверяет через Telethon `GetPeerStoriesRequest` — есть ли сторис, опубликованная сегодня (по ЕКБ)
- Если нет → отправляет «🔔 ОПУБЛИКУЙ СТОРИС» пользователю в бот
- Напоминания прекращаются автоматически как только в канале появляется сторис
- Фон холста 9:16 подбирается автоматически из краёв изображения (`_sample_edge_color`)

---

## Фронтенд

### Страницы (`/src/app`)

| Путь | Описание |
|------|----------|
| `/landing` | Лендинг (публичный) |
| `/login`, `/register` | Авторизация |
| `/forgot-password` | Сброс пароля |
| `/onboarding` | Онбординг нового бизнеса |
| `/plans` | Страница тарифов |
| `/payment/success` | Страница после оплаты |
| `/(app)/home` | Главный дашборд (KPI, аналитика, расписание) |
| `/(app)/content` | Контент-план (календарь слотов) |
| `/(app)/post-creator` | Быстрый пост с AI |
| `/(app)/analytics` | Аналитика TG + VK (посты, истории) |
| `/(app)/strategy` | Стратегия бизнеса |
| `/(app)/platforms` | Подключение соцсетей |

### Навигация

**Desktop:** фиксированный сайдбар слева (224px), тёмный `#0D1B2A`  
**Mobile:** top bar + bottom nav (4 пункта) + slide-out drawer ("Ещё")  
**Хук:** `useMobile()` — breakpoint 768px

### Компоненты

- `Aist.tsx` — маскот-заглушка для пустых состояний
- `Skeleton.tsx` — скелетоны загрузки (SkeletonCard, SkeletonKpi)

---

## Тарифы

| Тариф | Цена | Посты | Платформы |
|-------|------|-------|-----------|
| Демо | 0 ₽ (3 дня) | 10 | 1 |
| Старт | 2 990 ₽/мес | 12 | 1 |
| Бизнес | 5 990 ₽/мес | 30 | 3 |
| Про | 11 990 ₽/мес | ∞ | все |

> Платные тарифы в UI помечены "Скоро" — ЮКасса не настроена на сервере.

---

## Деплой

### Локальная разработка

```bash
cp .env.example .env   # заполнить переменные
docker compose up -d
# backend:  http://localhost:8000/docs
# frontend: http://localhost:3000
```

### Продакшн (на сервере)

```bash
cd /opt/smm-platform
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build backend frontend
```

### Через SSH с машины разработчика

```bash
ssh -i ~/.ssh/id_ed25519 root@178.105.159.177 \
  "cd /opt/smm-platform && git pull origin main && \
   docker compose -f docker-compose.prod.yml up -d --build backend frontend 2>&1 | tail -10"
```

### Мониторинг

```bash
# Статус контейнеров
docker compose -f docker-compose.prod.yml ps

# Логи
docker logs smm-platform-backend-1 --tail=50
docker logs smm-platform-celery_worker-1 --tail=50

# Health check
curl http://localhost:8000/health
```

---

## Переменные окружения (`.env`)

| Переменная | Назначение |
|-----------|-----------|
| `DATABASE_URL` | PostgreSQL DSN |
| `REDIS_URL` | Redis DSN |
| `SECRET_KEY` | JWT подписи |
| `FERNET_KEY` | Шифрование токенов соцсетей |
| `ANTHROPIC_API_KEY` | Claude API (тексты, стратегия) |
| `GEMINI_API_KEY` | Google Imagen 3 (картинки) |
| `VK_APP_ID` / `VK_APP_SECRET` | VK OAuth |
| `BREVO_API_KEY` | Email-рассылка |
| `YOOKASSA_SHOP_ID` / `YOOKASSA_SECRET_KEY` | Приём платежей |
| `TG_API_ID` / `TG_API_HASH` / `TG_STRING_SESSION` | TG аналитика (MTProto) |
| `S3_*` | Yandex Object Storage (картинки) |
| `DOMAIN` | Домен прода (включает prod-режим: скрывает /docs, HSTS) |

---

## Debug эндпоинты (только прод, защищены токеном)

Токен = `SHA-256(SECRET_KEY)[:32]`

```
GET  /api/debug/notifications-status?token=...
GET  /api/debug/gemini-models?token=...
POST /api/debug/trigger-notifications?token=...
POST /api/debug/trigger-replies-check?token=...
POST /api/debug/trigger-approvals?token=...
```

---

## Состояние сервера (на 24.06.2026)

- **Диск:** 32 GB / 75 GB (45%)
- **Память:** 2.8 GB / 3.7 GB — свап 2.6 GB из 4 GB ⚠️
- **Пользователей в БД:** 8
- **Git:** синхронизирован с main
- **SSL:** Let's Encrypt (Certbot), автообновление
