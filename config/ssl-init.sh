#!/bin/sh
# Auto-generate or provision SSL certificates based on SSL_MODE.
# Runs inside the nginx container before nginx starts (mounted into
# /docker-entrypoint.d/). The nginx entrypoint only runs it if it is
# executable, so docker-compose.yml also invokes it explicitly via `sh`.

SSL_MODE="${SSL_MODE:-self-signed}"
CERT="${SSL_CERT_PATH:-/etc/nginx/ssl/cert.pem}"
KEY="${SSL_KEY_PATH:-/etc/nginx/ssl/key.pem}"
DOMAIN="${SSL_DOMAIN:-mail.cloudmta.local}"
DAYS="${SSL_DAYS:-825}"

mkdir -p "$(dirname "$CERT")"

generate_self_signed() {
  if [ -f "$CERT" ] && [ -f "$KEY" ]; then
    echo "[ssl-init] Certificate already exists, skipping generation."
    return 0
  fi
  echo "[ssl-init] Generating self-signed certificate for $DOMAIN ..."
  openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "$KEY" \
    -out "$CERT" \
    -days "$DAYS" \
    -subj "/CN=$DOMAIN/O=CloudMTA/C=US" \
    -addext "subjectAltName=DNS:$DOMAIN,DNS:localhost,IP:127.0.0.1" || exit 1
  chmod 600 "$KEY"
  echo "[ssl-init] Self-signed certificate generated."
}

case "$SSL_MODE" in

  self-signed)
    generate_self_signed
    ;;

  letsencrypt)
    if [ -f "$CERT" ] && [ -f "$KEY" ]; then
      echo "[ssl-init] Certificate already exists, skipping."
    elif ! command -v certbot >/dev/null 2>&1; then
      # The stock nginx image has no certbot. Don't crash-loop nginx —
      # start with a self-signed cert and tell the operator what to do.
      echo "[ssl-init] WARNING: SSL_MODE=letsencrypt but certbot is not installed in this image."
      echo "[ssl-init] Obtain the certificate on the host (e.g. certbot certonly --standalone -d $DOMAIN),"
      echo "[ssl-init] copy fullchain.pem -> config/ssl/cert.pem and privkey.pem -> config/ssl/key.pem,"
      echo "[ssl-init] then set SSL_MODE=manual. Falling back to a self-signed certificate for now."
      generate_self_signed
    else
      echo "[ssl-init] Requesting Let's Encrypt certificate for $DOMAIN ..."
      if certbot certonly --standalone --non-interactive --agree-tos \
          -m "${CERTBOT_EMAIL:?CERTBOT_EMAIL must be set for SSL_MODE=letsencrypt}" \
          -d "$DOMAIN"; then
        cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$CERT"
        cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$KEY"
        chmod 600 "$KEY"
        echo "[ssl-init] Let's Encrypt certificate obtained."
      else
        echo "[ssl-init] WARNING: certbot failed; falling back to self-signed."
        generate_self_signed
      fi
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
    # (Previously this re-exec'd "$0" without exporting SSL_MODE, which
    # looped forever and hung nginx startup.)
    echo "[ssl-init] Unknown SSL_MODE=$SSL_MODE, defaulting to self-signed."
    generate_self_signed
    ;;
esac
