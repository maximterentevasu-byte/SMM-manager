# Деплой SMM Platform на Yandex Cloud

## Шаг 1 — Создать сервер в Yandex Cloud

1. Открой https://console.yandex.cloud
2. Compute Cloud → Создать ВМ
3. Параметры:
   - ОС: Ubuntu 22.04 LTS
   - CPU: 2 vCPU
   - RAM: 4 GB
   - Диск: 30 GB SSD
   - Публичный IP: включить (статический)
4. SSH ключ: вставь свой публичный ключ (~/.ssh/id_rsa.pub)
5. Запомни IP адрес сервера

## Шаг 2 — Купить домен и настроить DNS

В Яндекс 360 или любом регистраторе:
- A запись: @ → IP_СЕРВЕРА
- A запись: www → IP_СЕРВЕРА

Проверить: ping твой-домен.ru (должен ответить IP сервера)

## Шаг 3 — Подключиться к серверу

```bash
ssh ubuntu@IP_СЕРВЕРА
```

## Шаг 4 — Установить Docker

```bash
# Обновляем систему
sudo apt update && sudo apt upgrade -y

# Устанавливаем Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Проверяем
docker --version
docker compose version
```

## Шаг 5 — Установить Nginx и Certbot

```bash
sudo apt install nginx certbot python3-certbot-nginx -y
sudo systemctl enable nginx
sudo systemctl start nginx
```

## Шаг 6 — Загрузить проект на сервер

**Вариант А — через Git (рекомендую)**

Сначала загрузи проект на GitHub (приватный репозиторий):
```bash
# На своём ПК в папке smm-platform:
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/ТВО_ЛОГИН/smm-platform.git
git push -u origin main
```

Потом на сервере:
```bash
git clone https://github.com/ТВО_ЛОГИН/smm-platform.git
cd smm-platform
```

**Вариант Б — через SCP (напрямую)**
```bash
# На своём ПК:
scp -r C:\Users\admin\Desktop\smm-platform ubuntu@IP_СЕРВЕРА:~/smm-platform
```

## Шаг 7 — Создать .env на сервере

```bash
cd ~/smm-platform
cp .env.example .env
nano .env
```

Заполни все поля — те же что и локально, но:
- DATABASE_URL — оставь postgresql://smm_user:ПАРОЛЬ@postgres:5432/smm_platform
- Добавь DOMAIN=твой-домен.ru

## Шаг 8 — Настроить Next.js для продакшена

В файле frontend/next.config.js добавь:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
}
module.exports = nextConfig
```

## Шаг 9 — Скопировать конфиги

```bash
# Nginx конфиг
sudo cp ~/smm-platform/infra/nginx.conf /etc/nginx/sites-available/smm-platform
# Замени YOUR_DOMAIN на свой домен
sudo sed -i 's/YOUR_DOMAIN/твой-домен.ru/g' /etc/nginx/sites-available/smm-platform
sudo ln -s /etc/nginx/sites-available/smm-platform /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Шаг 10 — Получить SSL сертификат

```bash
sudo certbot --nginx -d твой-домен.ru -d www.твой-домен.ru
```

Certbot автоматически обновит nginx конфиг и включит SSL.

## Шаг 11 — Запустить приложение

```bash
cd ~/smm-platform
docker compose -f docker-compose.prod.yml up -d --build
```

Первый запуск займёт 5-10 минут (скачивает образы, собирает фронтенд).

## Шаг 12 — Проверить

```bash
# Статус контейнеров
docker compose -f docker-compose.prod.yml ps

# Логи
docker compose -f docker-compose.prod.yml logs backend --tail=20

# Проверка API
curl https://твой-домен.ru/api/health
```

Открой https://твой-домен.ru — должна работать платформа!

## Обновление (после изменений)

```bash
cd ~/smm-platform
bash deploy.sh
```

## Мониторинг

```bash
# Все логи
docker compose -f docker-compose.prod.yml logs -f

# Только ошибки
docker compose -f docker-compose.prod.yml logs backend | grep ERROR

# Использование ресурсов
docker stats
```

## Резервная копия БД

```bash
# Создать бэкап
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U smm_user smm_platform > backup_$(date +%Y%m%d).sql

# Восстановить
cat backup_20260509.sql | docker compose -f docker-compose.prod.yml exec -T postgres psql -U smm_user smm_platform
```
