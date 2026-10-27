<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasColumn('housing_units', 'interior_bounds')) {
            return;
        }
        Schema::table('housing_units', function (Blueprint $table) {
            $table->jsonb('interior_bounds')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (! Schema::hasColumn('housing_units', 'interior_bounds')) {
            return;
        }
        Schema::table('housing_units', function (Blueprint $table) {
            $table->dropColumn('interior_bounds');
        });
    }
};
