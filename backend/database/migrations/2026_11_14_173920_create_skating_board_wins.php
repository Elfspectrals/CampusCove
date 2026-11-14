<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const BADGE = 'skating_champion';

    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS skating_board_wins (
  week        CHAR(8) NOT NULL,
  laps        SMALLINT NOT NULL,
  account_id  BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  time_ms     INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (week, laps),
  CONSTRAINT ck_skating_board_wins_week CHECK (week ~ '^[0-9]{4}-W[0-9]{2}$'),
  CONSTRAINT ck_skating_board_wins_laps CHECK (laps IN (1, 3, 5)),
  CONSTRAINT ck_skating_board_wins_time CHECK (time_ms >= 0)
);
CREATE INDEX IF NOT EXISTS ix_skating_board_wins_account ON skating_board_wins (account_id);
SQL);
        $this->setBadges([...array_diff($this->badges(), [self::BADGE]), self::BADGE]);
    }

    public function down(): void
    {
        DB::table('account_badges')->where('badge', self::BADGE)->delete();
        $this->setBadges(array_values(array_diff($this->badges(), [self::BADGE])));
        DB::unprepared('DROP TABLE IF EXISTS skating_board_wins');
    }

    /** @return list<string> */
    private function badges(): array
    {
        $definition = DB::selectOne("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'ck_account_badges_badge'")?->def;
        if ($definition === null) {
            throw new RuntimeException('account_badges has no ck_account_badges_badge constraint');
        }
        preg_match_all("/'([a-z0-9_]+)'/", (string) $definition, $matches);

        return $matches[1];
    }

    /** @param list<string> $badges */
    private function setBadges(array $badges): void
    {
        $list = implode(', ', array_map(fn (string $badge): string => "'".$badge."'", $badges));
        DB::unprepared("ALTER TABLE account_badges DROP CONSTRAINT IF EXISTS ck_account_badges_badge;
ALTER TABLE account_badges ADD CONSTRAINT ck_account_badges_badge CHECK (badge IN ({$list}));");
    }
};
