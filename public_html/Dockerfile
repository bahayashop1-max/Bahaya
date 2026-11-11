FROM php:8.4-apache
RUN php -r 'exit(extension_loaded("curl") && extension_loaded("mbstring") ? 0 : 1);' \
    && sed -i 's/^Listen 80$/Listen 8090/' /etc/apache2/ports.conf \
    && sed -i 's/<VirtualHost \*:80>/<VirtualHost *:8090>/' /etc/apache2/sites-available/000-default.conf \
    && printf 'ok\n' > /var/www/html/healthz
COPY bahaya-stripe-checkout-LIVE.php /var/www/html/
EXPOSE 8090
