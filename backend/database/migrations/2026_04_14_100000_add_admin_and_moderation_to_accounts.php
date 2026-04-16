<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('accounts', function (Blueprint $table): void {
            if (! Schema::hasColumn('accounts', 'is_admin')) {
                $table->boolean('is_admin')->default(false);
            }
            if (! Schema::hasColumn('accounts', 'suspended_until')) {
                $table->timestampTz('suspended_until')->nullable();
            }
            if (! Schema::hasColumn('accounts', 'suspension_reason')) {
                $table->text('suspension_reason')->nullable();
            }
            if (! Schema::hasColumn('accounts', 'banned_at')) {
                $table->timestampTz('banned_at')->nullable();
            }
            if (! Schema::hasColumn('accounts', 'ban_reason')) {
                $table->text('ban_reason')->nullable();
            }
            if (! Schema::hasColumn('accounts', 'deleted_at')) {
                $table->timestampTz('deleted_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('accounts', function (Blueprint $table): void {
            $drop = [];
            foreach (['is_admin', 'suspended_until', 'suspension_reason', 'banned_at', 'ban_reason', 'deleted_at'] as $column) {
                if (Schema::hasColumn('accounts', $column)) {
                    $drop[] = $column;
                }
            }

            if ($drop !== []) {
                $table->dropColumn($drop);
            }
        });
    }
};
