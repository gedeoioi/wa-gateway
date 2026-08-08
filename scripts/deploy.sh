#!/bin/bash
set -e

echo "=== WA Gateway Enterprise Deployment ==="

echo "Pulling latest changes..."
git pull origin main

echo "Installing dependencies..."
npm install

echo "Building backend..."
npm run build --workspace=@wa-gateway/backend

echo "Generating Prisma client..."
cd packages/prisma && npx prisma generate && cd ../..

echo "Running migrations..."
cd packages/prisma && npx prisma migrate deploy && cd ../..

echo "Building frontend..."
npm run build --workspace=@wa-gateway/frontend

echo "Restarting PM2..."
pm2 restart ecosystem.config.js

echo ""
echo "=== Deployment Complete ==="
