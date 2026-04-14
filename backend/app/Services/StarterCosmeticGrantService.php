<?php

namespace App\Services;

use App\Models\ItemDef;

/**
 * Grants default wearable cosmetic stacks once per account (beta starter kit).
 */
final class StarterCosmeticGrantService
{
    /** @var list<string> */
    public const FREE_BODY_CODES = [
        'COS_WEAR_BODY_DEFAULT',
        'COS_WEAR_BODY_ADVENTURER',
        'COS_WEAR_BODY_SWORDSMAN',
    ];

    /**
     * Legacy wearable starter pack (used by dev helper flows like fillOutfit).
     *
     * @var list<string>
     */
    public const STARTER_CODES = [
        ...self::FREE_BODY_CODES,
        'COS_WEAR_HAIR_DEFAULT',
        'COS_WEAR_TOP_DEFAULT',
        'COS_WEAR_BOTTOM_DEFAULT',
        'COS_WEAR_SHOES_DEFAULT',
        'COS_WEAR_HEAD_EMPTY',
    ];

    public function __construct(
        private readonly AccountInventoryService $accountInventoryService,
    ) {}

    public function ensureStarterCosmeticsForAccount(int $accountId): void
    {
        $this->ensureCodesForAccount($accountId, self::FREE_BODY_CODES);
    }

    /**
     * @param  list<string>  $codes
     */
    public function ensureCodesForAccount(int $accountId, array $codes): void
    {
        foreach ($codes as $code) {
            /** @var ItemDef|null $def */
            $def = ItemDef::query()->where('code', $code)->first();
            if ($def === null) {
                continue;
            }
            if ($this->accountInventoryService->accountHasPositiveQuantity($accountId, $def->item_def_id)) {
                continue;
            }
            $this->accountInventoryService->grantPurchasedItems($accountId, $def, 1);
        }
    }
}
