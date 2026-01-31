<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('users') || Schema::hasColumn('users', 'pseudo')) {
            return;
        }
        Schema::table('users', function (Blueprint $table) {
            $table->string('pseudo')->nullable()->unique()->after('name');
        });
        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'pgsql' || $driver === 'sqlite') {
            DB::statement("UPDATE users SET pseudo = COALESCE(name, 'user') || '_' || id WHERE pseudo IS NULL");
        } else {
            DB::statement("UPDATE users SET pseudo = CONCAT(COALESCE(name, 'user'), '_', id) WHERE pseudo IS NULL");
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'pseudo')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropUnique(['pseudo']);
                $table->dropColumn('pseudo');
            });
        }
    }
};
