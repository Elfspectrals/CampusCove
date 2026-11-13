<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE account_tutorials
  ADD COLUMN IF NOT EXISTS step_baseline BIGINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT ck_account_tutorials_step_baseline CHECK (step_baseline >= 0);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('ALTER TABLE account_tutorials DROP COLUMN IF EXISTS step_baseline');
    }
};
