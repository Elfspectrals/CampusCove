<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Applies the full Campus Cove schema (accounts, characters, rooms, items, etc.).
     */
    public function up(): void
    {
        $path = database_path('schema/campus_cove_schema.sql');
        if (! File::exists($path)) {
            throw new \RuntimeException("Schema file not found: {$path}");
        }
        $sql = File::get($path);
        DB::unprepared($sql);
    }

    /**
     * Reverse the migrations.
     * Drops all Campus Cove tables and custom types.
     */
    public function down(): void
    {
        $tables = [
            'staff_audit_logs',
            'sanctions',
            'reports',
            'chat_logs',
            'gifts',
            'trade_escrows',
            'trade_sessions',
            'marketplace_listings',
            'guild_members',
            'guild_roles',
            'guilds',
            'friendships',
            'room_audit_logs',
            'room_furnitures',
            'room_mutes',
            'room_bans',
            'room_memberships',
            'room_layouts',
            'room_furniture_containers',
            'rooms',
            'buildings',
            'inventory_stacks',
            'item_instances',
            'account_shop_purchases',
            'shop_catalog_items',
            'item_defs',
            'gift_inboxes',
            'character_inventories',
            'containers',
            'transactions',
            'wallet_ledger',
            'wallets',
            'character_name_history',
            'characters',
            'account_roles',
            'role_permissions',
            'permissions',
            'roles',
            'account_auth_oauth',
            'account_auth_local',
            'account_handles',
            'accounts',
            'servers',
        ];

        foreach ($tables as $table) {
            DB::statement("DROP TABLE IF EXISTS {$table} CASCADE");
        }

        $types = [
            'bind_rule',
            'item_kind',
            'container_type',
            'tx_status',
            'tx_type',
            'listing_status',
            'room_role',
            'room_type',
            'friend_status',
            'account_status',
            'currency_code',
        ];

        foreach ($types as $type) {
            DB::statement("DROP TYPE IF EXISTS {$type} CASCADE");
        }
    }
};
