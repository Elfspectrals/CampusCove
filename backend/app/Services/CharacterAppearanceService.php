<?php

namespace App\Services;

use App\Models\Account;
use App\Models\ItemDef;
use Illuminate\Support\Facades\DB;

/**
 * The character a player builds on first entering the game, and edits later (docs/CHARACTER.md).
 *
 * Sex, face and build are account columns; skin and hair colours are the body / hair entries of the cosmetic
 * colours; the haircut is the hair equipment slot. Every haircut is free here. The first save also gives the
 * newcomer outfit, which the player wears again after each death (see SurvivalService::loseBelongings).
 */
final class CharacterAppearanceService
{
    /** @var list<string> */
    public const SEXES = ['m', 'f'];

    /** @var list<string> */
    public const BUILDS = ['slim', 'normal', 'broad'];

    public const FACE_COUNT = 6;

    /** Haircut key (front/public/assets/wear/hair/<key>/) => item code. */
    public const HAIRCUTS = [
        'basic' => 'COS_WEAR_HAIR_DEFAULT',
        'short' => 'COS_WEAR_HAIR_SHORT',
        'long' => 'COS_WEAR_HAIR_LONG',
        'curly' => 'COS_WEAR_HAIR_CURLY',
        'buzz' => 'COS_WEAR_HAIR_BUZZ',
        'ponytail' => 'COS_WEAR_HAIR_PONYTAIL',
    ];

    /** Slot => item code: the outfit given on creation and put back on after each death. */
    public const NEWCOMER_OUTFIT = [
        'top' => 'COS_WEAR_TOP_NEWCOMER',
        'bottom' => 'COS_WEAR_BOTTOM_NEWCOMER',
        'shoes' => 'COS_WEAR_SHOES_NEWCOMER',
    ];

    private const DEFAULT_BODY_CODE = 'COS_WEAR_BODY_DEFAULT';

    public function __construct(
        private readonly AccountCosmeticService $cosmetics,
        private readonly StarterCosmeticGrantService $grants,
        private readonly TutorialService $tutorial,
    ) {}

    /**
     * @return array{created: bool, sex: string|null, face: int|null, build: string|null, hair: string|null, skin_color: string, hair_color: string}
     */
    public function get(int $accountId): array
    {
        $account = Account::query()->where('account_id', $accountId)->firstOrFail();
        $colors = $this->cosmetics->getColors($accountId);
        $hairCode = $this->cosmetics->getLoadout($accountId)['hair']['code'] ?? null;

        return [
            'created' => $account->character_created_at !== null,
            'sex' => $account->character_sex,
            'face' => $account->character_face,
            'build' => $account->character_build,
            'hair' => $hairCode !== null ? (array_search($hairCode, self::HAIRCUTS, true) ?: null) : null,
            'skin_color' => $colors['body'],
            'hair_color' => $colors['hair'],
        ];
    }

    /**
     * The body to build (sex, face, build), or null before the character exists.
     *
     * @return array{sex: string, face: int, build: string}|null
     */
    public function look(int $accountId): ?array
    {
        $account = Account::query()->where('account_id', $accountId)->firstOrFail();
        if ($account->character_created_at === null) {
            return null;
        }

        return ['sex' => (string) $account->character_sex, 'face' => (int) $account->character_face, 'build' => (string) $account->character_build];
    }

    /**
     * Saves the whole appearance (the creator and the editor send every field). Safe to repeat: the newcomer outfit
     * is given and put on only by the first save.
     *
     * @param  array{sex: string, face: int, build: string, hair: string, skin_color: string, hair_color: string}  $appearance
     * @return array{created: bool, sex: string|null, face: int|null, build: string|null, hair: string|null, skin_color: string, hair_color: string}
     */
    public function save(int $accountId, array $appearance): array
    {
        DB::transaction(function () use ($accountId, $appearance): void {
            $account = Account::query()->where('account_id', $accountId)->lockForUpdate()->firstOrFail();
            $firstTime = $account->character_created_at === null;
            $account->update([
                'character_sex' => $appearance['sex'],
                'character_face' => $appearance['face'],
                'character_build' => $appearance['build'],
                'character_created_at' => $account->character_created_at ?? now(),
            ]);
            $this->cosmetics->setColors($accountId, ['body' => $appearance['skin_color'], 'hair' => $appearance['hair_color']]);

            $hairCode = self::HAIRCUTS[$appearance['hair']];
            $this->grants->ensureCodesForAccount($accountId, [$hairCode]);
            $this->cosmetics->setLoadout($accountId, ['hair' => $this->itemDefId($hairCode)]);

            if ($firstTime) {
                $this->dressAsNewcomer($accountId);
                $this->tutorial->start($accountId);
            }
        });

        return $this->get($accountId);
    }

    /** Default body, no head accessory, the newcomer top, bottom and shoes. The haircut stays. */
    public function dressAsNewcomer(int $accountId): void
    {
        $this->grants->ensureStarterCosmeticsForAccount($accountId);
        $this->grants->ensureCodesForAccount($accountId, array_values(self::NEWCOMER_OUTFIT));
        $slots = ['body' => $this->itemDefId(self::DEFAULT_BODY_CODE), 'head_accessory' => null];
        foreach (self::NEWCOMER_OUTFIT as $slot => $code) {
            $slots[$slot] = $this->itemDefId($code);
        }
        $this->cosmetics->setLoadout($accountId, $slots);
    }

    private function itemDefId(string $code): int
    {
        return (int) ItemDef::query()->where('code', $code)->valueOrFail('item_def_id');
    }
}
