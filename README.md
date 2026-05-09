# SMM Platform — Инструкция запуска

## ШАГ 1 — Подготовка (5 минут)

### 1.1 Скопируй .env файл
```bash
cp .env.example .env
```

### 1.2 Открой .env в VS Code и заполни обязательные поля:

**POSTGRES_PASSWORD** — придумай любой пароль (например: MyStr0ngPass123)
Обязательно замени его же в DATABASE_URL!

**SECRET_KEY** — случайная строка. Запусти в терминале:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**FERNET_KEY** — специальный ключ шифрования. После старта контейнеров:
```bash
docker-compose run --rm backend python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

**ANTHROPIC_API_KEY** — получи на https://console.anthropic.com
(Нажми "Get API Keys" → Create Key)

---

## ШАГ 2 — Запуск бэкенда (2 минуты)

```bash
# Запускаем только базу данных и Redis сначала
docker-compose up -d postgres redis

# Ждём 10 секунд пока поднимутся

# Запускаем бэкенд
docker-compose up -d backend celery_worker celery_beat flower
```

### Проверка что всё работает:
Открой в браузере: http://localhost:8000
Должно показать: {"message": "SMM Platform API работает ✓"}

Документация API: http://localhost:8000/docs
Мониторинг задач: http://localhost:5555

---

## ШАГ 3 — Запуск фронтенда (3 минуты)

```bash
cd frontend
npm install
npm run dev
```

Открой: http://localhost:3000

---

## ШАГ 4 — Первый тест

1. Открой http://localhost:8000/docs
2. Найди POST /api/auth/register
3. Нажми "Try it out"
4. Введи email и пароль
5. Нажми Execute
6. Должен вернуться access_token — это значит всё работает!

---

## Полезные команды

```bash
# Посмотреть логи бэкенда
docker-compose logs -f backend

# Посмотреть логи воркера (фоновые задачи)
docker-compose logs -f celery_worker

# Перезапустить бэкенд после изменений кода
docker-compose restart backend

# Остановить всё
docker-compose down

# Остановить и удалить данные БД (ОСТОРОЖНО)
docker-compose down -v
```

---

## Структура проекта

```
smm-platform/
├── docker-compose.yml    ← конфигурация всех сервисов
├── .env                  ← секреты (НЕ коммить в git!)
├── .env.example          ← шаблон .env
├── backend/
│   ├── app/
│   │   ├── main.py       ← точка входа FastAPI
│   │   ├── config.py     ← настройки из .env
│   │   ├── database.py   ← подключение к PostgreSQL
│   │   ├── models/       ← структура таблиц БД
│   │   ├── api/          ← HTTP роуты (auth, onboarding, content)
│   │   ├── agents/       ← AI агенты (стратег, копирайтер, etc)
│   │   └── workers/      ← фоновые задачи Celery
│   └── requirements.txt  ← Python зависимости
└── frontend/
    └── src/              ← Next.js приложение
```

---

## Что делать если что-то не работает

**Ошибка подключения к БД:**
```bash
docker-compose logs postgres
# Убедись что POSTGRES_PASSWORD в .env совпадает с тем что в DATABASE_URL
```

**Ошибка Fernet key:**
```bash
# Сгенерируй новый ключ:
docker-compose run --rm backend python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Скопируй результат в .env в поле FERNET_KEY
```

**Бэкенд не запускается:**
```bash
docker-compose logs backend
# Читай последние строки — там будет причина ошибки
```
