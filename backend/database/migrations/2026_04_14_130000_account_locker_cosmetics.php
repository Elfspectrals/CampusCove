<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('account_locker_cosmetics')) {
            DB::unprepared(<<<'SQL'
CREATE TABLE account_locker_cosmetics (
  account_id   BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  item_def_id  BIGINT NOT NULL REFERENCES item_defs(item_def_id) ON DELETE RESTRICT,
  quantity     INT NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, item_def_id),
  CONSTRAINT ck_account_locker_cosmetics_qty CHECK (quantity > 0)
);

CREATE INDEX ix_account_locker_cosmetics_item_def ON account_locker_cosmetics(item_def_id);
SQL);
        }

        DB::unprepared(<<<'SQL'
INSERT INTO account_locker_cosmetics (account_id, item_def_id, quantity, created_at, updated_at)
SELECT src.account_id, src.item_def_id, SUM(src.quantity)::int AS quantity, now(), now()
FROM (
  SELECT gi.account_id, s.item_def_id, s.quantity::int AS quantity
  FROM gift_inboxes gi
  JOIN inventory_stacks s ON s.container_id = gi.container_id
  JOIN item_defs d ON d.item_def_id = s.item_def_id
  WHERE d.kind = 'cosmetic'

  UNION ALL

  SELECT gi.account_id, i.item_def_id, COUNT(*)::int AS quantity
  FROM gift_inboxes gi
  JOIN item_instances i ON i.container_id = gi.container_id AND i.owner_account_id IS NOT NULL
  JOIN item_defs d ON d.item_def_id = i.item_def_id
  WHERE d.kind = 'cosmetic'
  GROUP BY gi.account_id, i.item_def_id
) AS src
GROUP BY src.account_id, src.item_def_id
ON CONFLICT (account_id, item_def_id) DO UPDATE
SET quantity = GREATEST(account_locker_cosmetics.quantity, EXCLUDED.quantity),
    updated_at = now();
SQL);
    }

    public function down(): void
    {
        if (Schema::hasTable('account_locker_cosmetics')) {
            DB::statement('DROP TABLE IF EXISTS account_locker_cosmetics CASCADE');
        }
    }
};
