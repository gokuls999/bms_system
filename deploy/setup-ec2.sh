#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 24.04 EC2 instance.
#
#   curl -fsSL https://raw.githubusercontent.com/gokuls999/bms_system/main/deploy/setup-ec2.sh | bash
#
# Installs Docker, adds swap (micro instances have 1 GB RAM), clones the repo,
# generates deploy/.env with random secrets, and starts the stack.
set -euo pipefail

REPO_URL="https://github.com/gokuls999/bms_system.git"
APP_DIR="$HOME/bms_system"

echo "==> Adding 2 GB swap"
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "==> Installing Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

echo "==> Fetching code"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR/deploy"

if [ ! -f .env ]; then
  echo "==> Generating .env"
  TOKEN=$(curl -sX PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
  PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
  HOST="bms.${PUBLIC_IP//./-}.sslip.io"
  cat > .env <<EOF
SITE_ADDRESS=$HOST
DJANGO_SECRET_KEY=$(openssl rand -hex 32)
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=$HOST,localhost
CSRF_TRUSTED_ORIGINS=https://$HOST
DB_NAME=bms
DB_USER=bms
DB_PASSWORD=$(openssl rand -hex 16)
LOW_STOCK_THRESHOLD=10
TIME_ZONE=Asia/Kolkata
GUNICORN_WORKERS=2
EOF
fi

echo "==> Building and starting containers (first build takes a few minutes)"
sudo docker compose up -d --build

echo
echo "Done. Site: https://$(grep ^SITE_ADDRESS .env | cut -d= -f2)"
