FROM php:8.3-cli-alpine

RUN apk add --no-cache \
    libpq-dev \
    icu-dev \
    libzip-dev \
    oniguruma-dev \
    git \
    unzip \
    $PHPIZE_DEPS \
    && docker-php-ext-configure pdo_pgsql \
    && docker-php-ext-install -j$(nproc) pdo_pgsql pdo_mysql bcmath intl zip opcache \
    && apk del $PHPIZE_DEPS

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]

EXPOSE 8000

CMD ["sh", "-c", "composer install --no-interaction && php artisan key:generate --force && php artisan migrate --force && php artisan serve --host=0.0.0.0 --port=8000"]
