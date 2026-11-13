<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

final class BadgeService
{
    public const NEW_CITIZEN = 'new_citizen';

    public function grant(int $accountId, string $badge): void
    {
        DB::table('account_badges')->insertOrIgnore(['account_id' => $accountId, 'badge' => $badge]);
    }

    /** @return list<string> */
    public function badges(int $accountId): array
    {
        return DB::table('account_badges')
            ->where('account_id', $accountId)
            ->orderBy('granted_at')
            ->orderBy('badge')
            ->pluck('badge')
            ->map(fn ($badge): string => (string) $badge)
            ->values()
            ->all();
    }
}
