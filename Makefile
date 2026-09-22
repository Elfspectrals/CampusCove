COMPOSE := docker compose
ART     := $(COMPOSE) exec -T backend php artisan

.PHONY: up down logs migrate seed seed-shop seed-housing expire-leases set-admin set-money fill-outfit test socket-rebuild

up:
	$(COMPOSE) up --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

migrate:
	$(ART) migrate --force

seed:
	$(ART) db:seed --force

seed-shop:
	$(ART) db:seed --class=ShopSeeder --force

seed-housing:
	$(ART) db:seed --class=HousingUnitSeeder --force

expire-leases:
	$(ART) housing:expire-leases

set-admin:
	$(ART) setAdmin $(EMAIL)

set-money:
	$(ART) setMoney $(ACCOUNT) $(CURRENCY) $(SUM)

fill-outfit:
	$(ART) fillOutfit $(ACCOUNT)

test:
	$(ART) test

socket-rebuild:
	$(COMPOSE) up -d --build socket
