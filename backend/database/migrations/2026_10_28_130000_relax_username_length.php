<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/** Usernames are no longer capped at 24 characters (AccountHandle::usernameRules); 255 stays as a safety net. */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE account_handles DROP CONSTRAINT IF EXISTS ck_account_username_len;
ALTER TABLE account_handles ADD CONSTRAINT ck_account_username_len CHECK (char_length(username) BETWEEN 3 AND 255);
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE account_handles DROP CONSTRAINT IF EXISTS ck_account_username_len;
ALTER TABLE account_handles ADD CONSTRAINT ck_account_username_len CHECK (char_length(username) BETWEEN 3 AND 24);
SQL);
    }
};
