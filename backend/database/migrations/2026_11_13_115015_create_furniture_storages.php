<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS furniture_storages (
  room_furniture_id  BIGINT PRIMARY KEY REFERENCES room_furnitures(room_furniture_id) ON DELETE RESTRICT,
  container_id       BIGINT NOT NULL UNIQUE REFERENCES containers(container_id) ON DELETE RESTRICT
);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS furniture_storages');
    }
};
