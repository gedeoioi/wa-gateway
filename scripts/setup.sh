#!/bin/bash
set -e

echo "=== WA Gateway Enterprise Setup ==="

if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

echo "Installing dependencies..."
npm install

echo "Copying .env.example to .env..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Please edit .env with your configuration"
fi

echo "Generating Prisma client..."
cd packages/prisma && npx prisma generate && cd ../..

echo "Running database migrations..."
cd packages/prisma && npx prisma migrate dev --name init && cd ../..

echo "Seeding database..."
cd packages/prisma && npx prisma db seed && cd ../..

echo ""
echo "=== Setup Complete ==="
echo "1. Edit .env with your configuration"
echo "2. Run 'npm run dev' to start development"
echo "3. Or run 'docker compose up -d' for production"
