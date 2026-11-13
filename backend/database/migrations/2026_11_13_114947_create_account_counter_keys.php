<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE account_counter_keys (
  account_id  BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  counter     TEXT NOT NULL,
  key         TEXT NOT NULL,
  counted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, counter, key)
);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS account_counter_keys');
    }
};
