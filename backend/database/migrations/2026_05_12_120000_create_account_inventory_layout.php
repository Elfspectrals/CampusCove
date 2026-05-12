<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_inventory_layout', function (Blueprint $table) {
            $table->unsignedBigInteger('account_id')->primary();

            $table->json('slots');
            $table->smallInteger('selected_hotbar_index')->default(0);
            $table->timestamps();

            $table->foreign('account_id')
                ->references('account_id')
                ->on('accounts')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_inventory_layout');
    }
};
