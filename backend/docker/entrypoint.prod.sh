#!/bin/sh
set -e
# The env is only known at run time, so the caches are built here rather than in the image.
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache
exec "$@"
