#!/bin/sh
# Auto-generate or provision SSL certificates based on SSL_MODE.
# Runs inside the nginx container before nginx starts.

SSL_MODE="${SSL_MODE:-self-signed}"
CERT="${SSL_CERT_PATH:-/etc/nginx/ssl/cert.pem}"
KEY="${SSL_KEY_PATH:-/etc/nginx/ssl/key.pem}"
DOMAIN="${SSL_DOMAIN:-mail.cloudmta.local}"
DAYS="${SSL_DAYS:-825}"

mkdir -p "$(dirname "$CERT")"

case "$SSL_MODE" in

  self-signed)
    if [ -f "$CERT" ] && [ -f "$KEY" ]; then
      echo "[ssl-init] Self-signed cert already exists, skipping generation."
    else
      echo "[ssl-init] Generating self-signed certificate for $DOMAIN ..."
      openssl req -x509 -nodes -newkey rsa:2048 \
        -keyout "$KEY" \
        -out "$CERT" \
        -days "$DAYS" \
        -subj "/CN=$DOMAIN/O=CloudMTA/C=US" \
        -addext "subjectAltName=DNS:$DOMAIN,DNS:localhost,IP:127.0.0.1"
      echo "[ssl-init] Self-signed certificate generated."
    fi
    ;;

  letsencrypt)
    if [ -f "$CERT" ] && [ -f "$KEY" ]; then
      echo "[ssl-init] Let's Encrypt cert already exists, skipping."
    else
      echo "[ssl-init] Requesting Let's Encrypt certificate for $DOMAIN ..."
      certbot certonly --standalone --non-interactive --agree-tos \
        -m "${CERTBOT_EMAIL:-admin@example.com}" \
        -d "$DOMAIN" \
        --cert-path "$CERT" \
        --key-path "$KEY"
      echo "[ssl-init] Let's Encrypt certificate obtained."
    fi
    ;;

  manual)
    if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
      echo "[ssl-init] ERROR: SSL_MODE=manual but cert/key not found at $CERT / $KEY"
      echo "[ssl-init] Place your cert.pem and key.pem in config/ssl/ and restart."
      exit 1
    fi
    echo "[ssl-init] Manual cert found, using existing files."
    ;;

  *)
    echo "[ssl-init] Unknown SSL_MODE=$SSL_MODE, defaulting to self-signed."
    SSL_MODE=self-signed
    exec "$0"
    ;;
esac
