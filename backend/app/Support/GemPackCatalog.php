<?php

namespace App\Support;

/**
 * Gem packs sold for real money, the single source of truth (the front only shows what GET /api/gems/packs
 * returns). `gems` is what the player receives, bonus included; `amount_cents` is the final price, taxes included.
 * Orders copy both at creation, so changing a pack never rewrites the history.
 */
final class GemPackCatalog
{
    public const CURRENCY = 'eur';

    /** @var array<string, array{gems: int, amount_cents: int}> */
    private const PACKS = [
        'gems_100' => ['gems' => 100, 'amount_cents' => 199],
        'gems_300' => ['gems' => 300, 'amount_cents' => 499],
        'gems_650' => ['gems' => 650, 'amount_cents' => 999],
        'gems_1400' => ['gems' => 1400, 'amount_cents' => 1999],
    ];

    /** @return list<array{code: string, gems: int, amount_cents: int, currency: string}> */
    public static function all(): array
    {
        $packs = [];
        foreach (self::PACKS as $code => $pack) {
            $packs[] = ['code' => $code, ...$pack, 'currency' => self::CURRENCY];
        }

        return $packs;
    }

    /** @return array{code: string, gems: int, amount_cents: int, currency: string}|null */
    public static function find(string $code): ?array
    {
        $pack = self::PACKS[$code] ?? null;

        return $pack === null ? null : ['code' => $code, ...$pack, 'currency' => self::CURRENCY];
    }

    /** @return list<string> */
    public static function codes(): array
    {
        return array_keys(self::PACKS);
    }
}
