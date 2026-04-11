-- =========================================================
-- Extensions
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- =========================================================
-- Enums
-- =========================================================
DO $$ BEGIN
  CREATE TYPE currency_code AS ENUM ('coins', 'premium');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE account_status AS ENUM ('active', 'disabled', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE friend_status AS ENUM ('pending', 'accepted', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE room_type AS ENUM ('apartment', 'public_zone');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE room_role AS ENUM ('owner', 'co_owner', 'editor', 'mod', 'visitor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE listing_status AS ENUM ('active', 'sold', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tx_type AS ENUM ('shop_purchase', 'market_sale', 'trade', 'gift', 'admin_adjust');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tx_status AS ENUM ('pending', 'committed', 'cancelled', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE container_type AS ENUM (
    'character_inventory',
    'room_furniture',
    'market_listing_escrow',
    'trade_escrow',
    'gift_inbox'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE item_kind AS ENUM ('furniture', 'cosmetic', 'consumable', 'misc');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bind_rule AS ENUM ('none', 'bind_on_equip', 'bind_on_place', 'bound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- 1) Servers
-- =========================================================
CREATE TABLE IF NOT EXISTS servers (
  server_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id      UUID NOT NULL DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL UNIQUE,
  is_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_servers_public_id ON servers(public_id);

-- =========================================================
-- 2) Accounts & Auth
-- =========================================================
CREATE TABLE IF NOT EXISTS accounts (
  account_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id      UUID NOT NULL DEFAULT gen_random_uuid(),
  status         account_status NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at  TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_accounts_public_id ON accounts(public_id);

CREATE TABLE IF NOT EXISTS account_handles (
  account_id     BIGINT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
  username       TEXT NOT NULL,
  tag            SMALLINT NOT NULL,
  normalized     TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_account_tag_range CHECK (tag BETWEEN 0 AND 9999),
  CONSTRAINT ck_account_username_len CHECK (char_length(username) BETWEEN 3 AND 24)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_account_handles_username ON account_handles(normalized);
CREATE UNIQUE INDEX IF NOT EXISTS ux_account_handles_username_tag ON account_handles(normalized, tag);

CREATE TABLE IF NOT EXISTS account_auth_local (
  account_id     BIGINT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
  email          CITEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_auth_oauth (
  oauth_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id        BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  provider          TEXT NOT NULL,
  provider_user_id  TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS ix_oauth_account_id ON account_auth_oauth(account_id);

CREATE TABLE IF NOT EXISTS roles (
  role_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  permission_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id        BIGINT NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
  permission_id  BIGINT NOT NULL REFERENCES permissions(permission_id) ON DELETE CASCADE,
  PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS account_roles (
  account_id   BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  role_id      BIGINT NOT NULL REFERENCES roles(role_id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id, role_id)
);

-- =========================================================
-- 3) Characters
-- =========================================================
CREATE TABLE IF NOT EXISTS characters (
  character_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id      UUID NOT NULL DEFAULT gen_random_uuid(),
  account_id     BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  server_id      BIGINT NOT NULL REFERENCES servers(server_id) ON DELETE RESTRICT,
  name           TEXT NOT NULL,
  normalized     TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NULL,
  CONSTRAINT ck_character_name_len CHECK (char_length(name) BETWEEN 3 AND 24)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_characters_name ON characters(normalized);
CREATE UNIQUE INDEX IF NOT EXISTS ux_characters_public_id ON characters(public_id);
CREATE INDEX IF NOT EXISTS ix_characters_account ON characters(account_id);
CREATE INDEX IF NOT EXISTS ix_characters_server ON characters(server_id);

CREATE TABLE IF NOT EXISTS character_name_history (
  history_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  character_id   BIGINT NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  old_name       TEXT NOT NULL,
  old_normalized TEXT NOT NULL,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_char_name_hist_char ON character_name_history(character_id);

-- =========================================================
-- 4) Wallet / Ledger
-- =========================================================
CREATE TABLE IF NOT EXISTS wallets (
  wallet_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_type     TEXT NOT NULL,
  owner_id       BIGINT NOT NULL,
  currency       currency_code NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_type, owner_id, currency)
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  entry_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet_id      BIGINT NOT NULL REFERENCES wallets(wallet_id) ON DELETE CASCADE,
  tx_id          BIGINT NULL,
  delta          BIGINT NOT NULL,
  reason         TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ledger_wallet_time ON wallet_ledger(wallet_id, created_at);

-- =========================================================
-- 5) Transactions
-- =========================================================
CREATE TABLE IF NOT EXISTS transactions (
  tx_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  server_id    BIGINT NULL REFERENCES servers(server_id) ON DELETE RESTRICT,
  type         tx_type NOT NULL,
  status       tx_status NOT NULL DEFAULT 'pending',
  created_by_account_id BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_at TIMESTAMPTZ NULL,
  meta_json    JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ix_tx_server_time ON transactions(server_id, created_at);

-- =========================================================
-- 6) Containers
-- =========================================================
CREATE TABLE IF NOT EXISTS containers (
  container_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type         container_type NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS character_inventories (
  character_id  BIGINT PRIMARY KEY REFERENCES characters(character_id) ON DELETE CASCADE,
  container_id  BIGINT NOT NULL UNIQUE REFERENCES containers(container_id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gift_inboxes (
  account_id    BIGINT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
  container_id  BIGINT NOT NULL UNIQUE REFERENCES containers(container_id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- 7) Items
-- =========================================================
CREATE TABLE IF NOT EXISTS item_defs (
  item_def_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  kind            item_kind NOT NULL,
  rarity          SMALLINT NOT NULL DEFAULT 0,
  tradable        BOOLEAN NOT NULL DEFAULT TRUE,
  premium_only    BOOLEAN NOT NULL DEFAULT FALSE,
  bind            bind_rule NOT NULL DEFAULT 'none',
  max_stack       INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_max_stack CHECK (max_stack >= 1)
);

CREATE INDEX IF NOT EXISTS ix_item_defs_kind ON item_defs(kind);

CREATE TABLE IF NOT EXISTS item_instances (
  item_instance_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id        UUID NOT NULL DEFAULT gen_random_uuid(),
  item_def_id      BIGINT NOT NULL REFERENCES item_defs(item_def_id) ON DELETE RESTRICT,
  owner_account_id   BIGINT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  owner_character_id BIGINT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  container_id     BIGINT NOT NULL REFERENCES containers(container_id) ON DELETE RESTRICT,
  locked_tx_id     BIGINT NULL REFERENCES transactions(tx_id) ON DELETE SET NULL,
  lock_expires_at  TIMESTAMPTZ NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_item_owner_one CHECK (
    (owner_account_id IS NOT NULL AND owner_character_id IS NULL)
    OR
    (owner_account_id IS NULL AND owner_character_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_item_instances_public_id ON item_instances(public_id);
CREATE INDEX IF NOT EXISTS ix_item_instances_owner_account ON item_instances(owner_account_id);
CREATE INDEX IF NOT EXISTS ix_item_instances_owner_character ON item_instances(owner_character_id);
CREATE INDEX IF NOT EXISTS ix_item_instances_container ON item_instances(container_id);
CREATE INDEX IF NOT EXISTS ix_item_instances_lock ON item_instances(locked_tx_id) WHERE locked_tx_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS inventory_stacks (
  stack_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_def_id    BIGINT NOT NULL REFERENCES item_defs(item_def_id) ON DELETE RESTRICT,
  container_id   BIGINT NOT NULL REFERENCES containers(container_id) ON DELETE RESTRICT,
  quantity       INT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_stack_qty CHECK (quantity > 0),
  UNIQUE(item_def_id, container_id)
);

CREATE INDEX IF NOT EXISTS ix_stacks_container ON inventory_stacks(container_id);

-- =========================================================
-- 7b) Shop (catalog + purchases)
-- =========================================================
CREATE TABLE IF NOT EXISTS shop_catalog_items (
  shop_catalog_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id              UUID NOT NULL DEFAULT gen_random_uuid(),
  item_def_id            BIGINT NOT NULL REFERENCES item_defs(item_def_id) ON DELETE RESTRICT,
  currency               currency_code NOT NULL,
  price                  BIGINT NOT NULL,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  is_unique_per_account  BOOLEAN NOT NULL DEFAULT FALSE,
  stock_remaining        INT NULL,
  sort_order             INT NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_shop_catalog_price CHECK (price > 0),
  CONSTRAINT ck_shop_catalog_stock CHECK (stock_remaining IS NULL OR stock_remaining >= 0),
  UNIQUE(item_def_id, currency)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_shop_catalog_public_id ON shop_catalog_items(public_id);
CREATE INDEX IF NOT EXISTS ix_shop_catalog_active_sort ON shop_catalog_items(is_active, sort_order);

CREATE TABLE IF NOT EXISTS account_shop_purchases (
  purchase_id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id               BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  shop_catalog_item_id     BIGINT NOT NULL REFERENCES shop_catalog_items(shop_catalog_item_id) ON DELETE RESTRICT,
  tx_id                    BIGINT NOT NULL REFERENCES transactions(tx_id) ON DELETE RESTRICT,
  quantity                 INT NOT NULL,
  unit_price               BIGINT NOT NULL,
  total_debit              BIGINT NOT NULL,
  currency                 currency_code NOT NULL,
  is_unique_at_purchase    BOOLEAN NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_shop_purchase_qty CHECK (quantity > 0),
  CONSTRAINT ck_shop_purchase_prices CHECK (unit_price > 0 AND total_debit > 0)
);

CREATE INDEX IF NOT EXISTS ix_account_shop_purchases_account ON account_shop_purchases(account_id, created_at);
CREATE INDEX IF NOT EXISTS ix_account_shop_purchases_catalog ON account_shop_purchases(shop_catalog_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_account_shop_purchase_unique
  ON account_shop_purchases(account_id, shop_catalog_item_id)
  WHERE is_unique_at_purchase = true;

-- =========================================================
-- 8) Rooms / Housing
-- =========================================================
CREATE TABLE IF NOT EXISTS buildings (
  building_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  server_id    BIGINT NOT NULL REFERENCES servers(server_id) ON DELETE RESTRICT,
  name         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, name)
);

CREATE TABLE IF NOT EXISTS rooms (
  room_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id    UUID NOT NULL DEFAULT gen_random_uuid(),
  server_id    BIGINT NOT NULL REFERENCES servers(server_id) ON DELETE RESTRICT,
  type         room_type NOT NULL,
  building_id  BIGINT NULL REFERENCES buildings(building_id) ON DELETE SET NULL,
  owner_character_id BIGINT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rooms_public_id ON rooms(public_id);
CREATE INDEX IF NOT EXISTS ix_rooms_server_type ON rooms(server_id, type);
CREATE INDEX IF NOT EXISTS ix_rooms_owner ON rooms(owner_character_id);

CREATE TABLE IF NOT EXISTS room_furniture_containers (
  room_id       BIGINT PRIMARY KEY REFERENCES rooms(room_id) ON DELETE CASCADE,
  container_id  BIGINT NOT NULL UNIQUE REFERENCES containers(container_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS room_layouts (
  room_id       BIGINT PRIMARY KEY REFERENCES rooms(room_id) ON DELETE CASCADE,
  layout_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_memberships (
  room_id        BIGINT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  account_id     BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  role           room_role NOT NULL DEFAULT 'visitor',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(room_id, account_id)
);

CREATE INDEX IF NOT EXISTS ix_room_memberships_room_role ON room_memberships(room_id, role);

CREATE TABLE IF NOT EXISTS room_bans (
  room_id      BIGINT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  account_id   BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  banned_by_account_id BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  reason       TEXT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(room_id, account_id)
);

CREATE TABLE IF NOT EXISTS room_mutes (
  room_id      BIGINT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  account_id   BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  muted_by_account_id BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  reason       TEXT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(room_id, account_id)
);

CREATE INDEX IF NOT EXISTS ix_room_mutes_expires ON room_mutes(expires_at);

CREATE TABLE IF NOT EXISTS room_furnitures (
  room_furniture_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id           BIGINT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  item_instance_id  BIGINT NOT NULL UNIQUE REFERENCES item_instances(item_instance_id) ON DELETE RESTRICT,
  pos_x             DOUBLE PRECISION NOT NULL,
  pos_y             DOUBLE PRECISION NOT NULL,
  pos_z             DOUBLE PRECISION NOT NULL,
  rot_x             DOUBLE PRECISION NOT NULL DEFAULT 0,
  rot_y             DOUBLE PRECISION NOT NULL DEFAULT 0,
  rot_z             DOUBLE PRECISION NOT NULL DEFAULT 0,
  scale_x           DOUBLE PRECISION NOT NULL DEFAULT 1,
  scale_y           DOUBLE PRECISION NOT NULL DEFAULT 1,
  scale_z           DOUBLE PRECISION NOT NULL DEFAULT 1,
  state_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  placed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_room_furnitures_room ON room_furnitures(room_id);

CREATE TABLE IF NOT EXISTS room_audit_logs (
  audit_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id         BIGINT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  actor_account_id BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  subject_item_instance_id BIGINT NULL REFERENCES item_instances(item_instance_id) ON DELETE SET NULL,
  details_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_room_audit_room_time ON room_audit_logs(room_id, created_at);

-- =========================================================
-- 9) Friends / Blocks
-- =========================================================
CREATE TABLE IF NOT EXISTS friendships (
  account_id_a  BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  account_id_b  BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  status        friend_status NOT NULL,
  requested_by  BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id_a, account_id_b),
  CONSTRAINT ck_friend_pair_order CHECK (account_id_a < account_id_b)
);

CREATE INDEX IF NOT EXISTS ix_friendships_status ON friendships(status);

-- =========================================================
-- 10) Guilds
-- =========================================================
CREATE TABLE IF NOT EXISTS guilds (
  guild_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id    UUID NOT NULL DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  created_by_character_id BIGINT NULL REFERENCES characters(character_id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_guilds_public_id ON guilds(public_id);

CREATE TABLE IF NOT EXISTS guild_roles (
  guild_role_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guild_id      BIGINT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  rank          INT NOT NULL,
  permissions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(guild_id, name),
  UNIQUE(guild_id, rank)
);

CREATE TABLE IF NOT EXISTS guild_members (
  guild_id      BIGINT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  character_id  BIGINT NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  guild_role_id BIGINT NULL REFERENCES guild_roles(guild_role_id) ON DELETE SET NULL,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(guild_id, character_id)
);

CREATE INDEX IF NOT EXISTS ix_guild_members_character ON guild_members(character_id);

-- =========================================================
-- 11) Marketplace
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_listings (
  listing_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  server_id     BIGINT NOT NULL REFERENCES servers(server_id) ON DELETE RESTRICT,
  seller_character_id BIGINT NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  item_instance_id BIGINT NOT NULL UNIQUE REFERENCES item_instances(item_instance_id) ON DELETE RESTRICT,
  currency     currency_code NOT NULL DEFAULT 'coins',
  price        BIGINT NOT NULL,
  status       listing_status NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sold_at      TIMESTAMPTZ NULL,
  escrow_container_id BIGINT NOT NULL UNIQUE REFERENCES containers(container_id) ON DELETE RESTRICT,
  CONSTRAINT ck_listing_price CHECK (price > 0)
);

CREATE INDEX IF NOT EXISTS ix_listings_server_status ON marketplace_listings(server_id, status);
CREATE INDEX IF NOT EXISTS ix_listings_seller ON marketplace_listings(seller_character_id);

-- =========================================================
-- 12) Trades
-- =========================================================
CREATE TABLE IF NOT EXISTS trade_sessions (
  trade_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  server_id    BIGINT NOT NULL REFERENCES servers(server_id) ON DELETE RESTRICT,
  room_id      BIGINT NOT NULL REFERENCES rooms(room_id) ON DELETE RESTRICT,
  character_a_id BIGINT NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  character_b_id BIGINT NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  status       tx_status NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_trade_room ON trade_sessions(room_id, created_at);

CREATE TABLE IF NOT EXISTS trade_escrows (
  trade_id       BIGINT NOT NULL REFERENCES trade_sessions(trade_id) ON DELETE CASCADE,
  character_id   BIGINT NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  container_id   BIGINT NOT NULL UNIQUE REFERENCES containers(container_id) ON DELETE RESTRICT,
  coins_offered  BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY(trade_id, character_id),
  CONSTRAINT ck_trade_coins_nonneg CHECK (coins_offered >= 0)
);

-- =========================================================
-- 13) Gifts
-- =========================================================
CREATE TABLE IF NOT EXISTS gifts (
  gift_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender_character_id BIGINT NULL REFERENCES characters(character_id) ON DELETE SET NULL,
  recipient_account_id BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  item_instance_id BIGINT NOT NULL UNIQUE REFERENCES item_instances(item_instance_id) ON DELETE RESTRICT,
  message       TEXT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_gifts_recipient_time ON gifts(recipient_account_id, delivered_at);

-- =========================================================
-- 14) Chat logs
-- =========================================================
CREATE TABLE IF NOT EXISTS chat_logs (
  chat_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  server_id    BIGINT NOT NULL REFERENCES servers(server_id) ON DELETE RESTRICT,
  room_id      BIGINT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  author_character_id BIGINT NULL REFERENCES characters(character_id) ON DELETE SET NULL,
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_chat_room_time ON chat_logs(room_id, created_at);
CREATE INDEX IF NOT EXISTS ix_chat_author_time ON chat_logs(author_character_id, created_at);

-- =========================================================
-- 15) Reports / Sanctions / Staff audit
-- =========================================================
CREATE TABLE IF NOT EXISTS reports (
  report_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  server_id    BIGINT NOT NULL REFERENCES servers(server_id) ON DELETE RESTRICT,
  reporter_account_id BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  target_account_id   BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  room_id       BIGINT NULL REFERENCES rooms(room_id) ON DELETE SET NULL,
  chat_id       BIGINT NULL REFERENCES chat_logs(chat_id) ON DELETE SET NULL,
  reason        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at     TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_reports_status_time ON reports(status, created_at);

CREATE TABLE IF NOT EXISTS sanctions (
  sanction_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_account_id BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  staff_account_id  BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  kind          TEXT NOT NULL,
  reason        TEXT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NULL,
  meta_json     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ix_sanctions_target ON sanctions(target_account_id, created_at);
CREATE INDEX IF NOT EXISTS ix_sanctions_expires ON sanctions(expires_at);

CREATE TABLE IF NOT EXISTS staff_audit_logs (
  audit_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_account_id BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  target_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_staff_audit_time ON staff_audit_logs(created_at);
