<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('housing_units', function (Blueprint $table) {
            $table->boolean('door_locked')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('housing_units', function (Blueprint $table) {
            $table->dropColumn('door_locked');
        });
    }
};
