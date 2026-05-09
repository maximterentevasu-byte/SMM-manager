#!/bin/bash
# deploy.sh — запускать на сервере после первой настройки

set -e

echo "=== SMM Platform Deploy ==="

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Pulling latest changes...${NC}"
git pull origin main

echo -e "${YELLOW}Building images...${NC}"
docker compose -f docker-compose.prod.yml build --no-cache

echo -e "${YELLOW}Restarting services...${NC}"
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

echo -e "${YELLOW}Waiting for backend...${NC}"
sleep 15

echo -e "${YELLOW}Checking health...${NC}"
curl -sf http://localhost:8000/health && echo -e "${GREEN}Backend OK${NC}" || echo "Backend not ready yet"

echo -e "${GREEN}=== Deploy complete ===${NC}"
docker compose -f docker-compose.prod.yml ps
