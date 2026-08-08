# Deployment Guide - Ubuntu 24.04 LTS

## 1. Server Preparation

### Update System
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential
```

### Install Node.js 22 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

### Install MySQL 8.0
```bash
sudo apt install -y mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql

sudo mysql_secure_installation

sudo mysql -u root -p
```

```sql
CREATE DATABASE wa_gateway;
CREATE USER 'wa_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON wa_gateway.* TO 'wa_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Install Redis
```bash
sudo apt install -y redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
redis-cli ping
```

### Install PM2
```bash
sudo npm install -g pm2
```

### Install Nginx
```bash
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

## 2. Firewall Configuration

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw allow 3001
sudo ufw enable
sudo ufw status
```

## 3. Application Deployment

```bash
cd /var/www
sudo git clone <repository-url> wa-gateway
sudo chown -R $USER:$USER wa-gateway
cd wa-gateway

cp .env.example .env
nano .env
```

Edit `.env`:
```
NODE_ENV=production
DATABASE_URL=mysql://wa_user:your_secure_password@localhost:3306/wa_gateway
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars
BACKEND_PORT=3001
FRONTEND_URL=https://your-domain.com
BACKEND_URL=https://your-domain.com
```

```bash
npm install
npx prisma generate --schema=prisma/schema.prisma
npx prisma migrate deploy --schema=prisma/schema.prisma
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 4. Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/wa-gateway
```

Copy contents from `nginx/nginx.conf` (adjust server_name).

```bash
sudo ln -s /etc/nginx/sites-available/wa-gateway /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 5. SSL with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
sudo certbot renew --dry-run
```

After SSL is set up, replace nginx config with `nginx/nginx-ssl.conf` content (update domain).

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 6. Database Backup

```bash
chmod +x scripts/backup-db.sh
./scripts/backup-db.sh
```

### Automated Backup (Cron)
```bash
crontab -e
```

Add:
```
0 2 * * * cd /var/www/wa-gateway && ./scripts/backup-db.sh >> /var/log/wa-backup.log 2>&1
```

## 7. Database Restore

```bash
./scripts/restore-db.sh ./backups/wa_gateway_20250101_020000.sql.gz
```

## 8. Update Application

```bash
cd /var/www/wa-gateway
./scripts/deploy.sh
```

## 9. Rollback

```bash
cd /var/www/wa-gateway
git log --oneline -5
git checkout <previous-commit-hash>
npm install
npm run build
npx prisma migrate deploy --schema=prisma/schema.prisma
pm2 restart ecosystem.config.js
```

## 10. Monitoring

```bash
pm2 monit
pm2 logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```