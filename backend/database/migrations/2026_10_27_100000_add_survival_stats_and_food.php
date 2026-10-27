<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Survival gameplay (hunger, thirst, health):
 * - account_survival_stats: last values saved by the realtime server (100 = full);
 * - item_defs: what one portion of a consumable restores (food items are seeded by ShopSeeder from FoodCatalog);
 * - inventory_stacks.portions_used: bites already taken from the top item of the stack (4/4 -> 3/4 ...);
 * - tx_type 'hospital_bill' for the fee charged when a player passes out.
 */
return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        DB::unprepared(<<<'SQL'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'tx_type'
          AND e.enumlabel = 'hospital_bill'
    ) THEN
        ALTER TYPE tx_type ADD VALUE 'hospital_bill';
    END IF;
END $$;
SQL);

        if (! Schema::hasTable('account_survival_stats')) {
            Schema::create('account_survival_stats', function (Blueprint $table) {
                $table->unsignedBigInteger('account_id')->primary();
                $table->float('health')->default(100);
                $table->float('hunger')->default(100);
                $table->float('thirst')->default(100);
                $table->timestampTz('updated_at')->nullable();
                $table->foreign('account_id')->references('account_id')->on('accounts')->cascadeOnDelete();
            });
        }

        Schema::table('item_defs', function (Blueprint $table) {
            if (! Schema::hasColumn('item_defs', 'portions')) {
                $table->smallInteger('portions')->nullable();
                $table->smallInteger('hunger_per_portion')->default(0);
                $table->smallInteger('thirst_per_portion')->default(0);
                $table->smallInteger('health_per_portion')->default(0);
                $table->string('consume_effect', 32)->nullable();
            }
        });

        if (! Schema::hasColumn('inventory_stacks', 'portions_used')) {
            Schema::table('inventory_stacks', function (Blueprint $table) {
                $table->smallInteger('portions_used')->default(0);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('inventory_stacks', 'portions_used')) {
            Schema::table('inventory_stacks', function (Blueprint $table) {
                $table->dropColumn('portions_used');
            });
        }
        if (Schema::hasColumn('item_defs', 'portions')) {
            Schema::table('item_defs', function (Blueprint $table) {
                $table->dropColumn(['portions', 'hunger_per_portion', 'thirst_per_portion', 'health_per_portion', 'consume_effect']);
            });
        }
        Schema::dropIfExists('account_survival_stats');
        // Postgres cannot drop an enum value: 'hospital_bill' stays in tx_type.
    }
};
