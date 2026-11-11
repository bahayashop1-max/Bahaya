FROM dunglas/frankenphp:php8.4
RUN install-php-extensions curl mbstring
COPY Bahaya.Caddyfile /etc/caddy/Bahaya.Caddyfile
COPY bahaya-stripe-checkout-LIVE.php /app/public/
RUN frankenphp validate --config /etc/caddy/Bahaya.Caddyfile --adapter caddyfile
EXPOSE 8090
CMD ["frankenphp", "run", "--config", "/etc/caddy/Bahaya.Caddyfile", "--adapter", "caddyfile"]
