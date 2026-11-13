<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS account_respawn_beds (
  account_id         BIGINT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
  room_furniture_id  BIGINT NOT NULL REFERENCES room_furnitures(room_furniture_id) ON DELETE CASCADE,
  set_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS account_respawn_beds');
    }
};
