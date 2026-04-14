<?php

namespace App\Services;

use App\Models\ItemDef;

/**
 * Grants default wearable cosmetic stacks once per account (beta starter kit).
 */
final class StarterCosmeticGrantService
{
    private const FREE_BODY_PREVIEW_IMAGE = '/storage/skins/previews/placeholderSkin.jpg';

    /** @var array<string, string> */
    private const FREE_BODY_MODEL_BY_CODE = [
        'COS_WEAR_BODY_DEFAULT' => '/storage/skins/models/low_poly_character.glb',
        'COS_WEAR_BODY_ADVENTURER' => '/storage/skins/models/low_poly_adventurer.glb',
        'COS_WEAR_BODY_SWORDSMAN' => '/storage/skins/models/low_poly_character_swordsman.glb',
    ];

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
        $this->ensureFreeBodyDefinitionsConfigured();
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

    private function ensureFreeBodyDefinitionsConfigured(): void
    {
        foreach (self::FREE_BODY_CODES as $code) {
            ItemDef::query()->updateOrCreate(
                ['code' => $code],
                [
                    'name' => match ($code) {
                        'COS_WEAR_BODY_ADVENTURER' => 'Campus Adventurer',
                        'COS_WEAR_BODY_SWORDSMAN' => 'Campus Swordsman',
                        default => 'Campus Body (default)',
                    },
                    'kind' => 'cosmetic',
                    'rarity' => 0,
                    'tradable' => false,
                    'premium_only' => false,
                    'bind' => 'bound',
                    'max_stack' => 99,
                    'cosmetic_slot' => 'body',
                    'preview_image' => self::FREE_BODY_PREVIEW_IMAGE,
                    'model_glb' => self::FREE_BODY_MODEL_BY_CODE[$code],
                ]
            );
        }
    }
}
