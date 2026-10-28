<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/** The e-mail news opt-in was dropped before launch; removes the column where an earlier migration created it. */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE accounts DROP COLUMN IF EXISTS marketing_opt_in');
    }

    public function down(): void
    {
        // nothing to restore: the column never held data in production
    }
};
