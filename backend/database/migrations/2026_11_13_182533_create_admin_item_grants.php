<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS admin_item_grants (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ref               UUID NOT NULL UNIQUE,
  admin_account_id  BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  to_account_id     BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  item_def_id       BIGINT NOT NULL REFERENCES item_defs(item_def_id) ON DELETE CASCADE,
  quantity          INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 999),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS admin_item_grants');
    }
};
