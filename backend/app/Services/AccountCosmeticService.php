<?php

namespace App\Services;

use App\Models\Account;
use App\Models\GiftInbox;
use App\Models\ItemDef;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

final class AccountCosmeticService
{
    /** @var list<string> */
    public const SLOTS = ['body', 'hair', 'top', 'bottom', 'shoes', 'head_accessory'];

    /** @var array<string, string> */
    public const DEFAULT_HEX_BY_SLOT = [
        'body' => '#8B7AA8',
        'hair' => '#6B5B95',
        'top' => '#9B8ABF',
        'bottom' => '#5A4E72',
        'shoes' => '#4A3F62',
        'head_accessory' => '#7A6B94',
    ];

    /**
     * @return array<string, string>
     */
    public function getColors(int $accountId): array
    {
        /** @var Account|null $account */
        $account = Account::query()->where('account_id', $accountId)->first();
        $stored = ($account !== null && is_array($account->cosmetic_colors)) ? $account->cosmetic_colors : [];
        $out = [];
        foreach (self::SLOTS as $slot) {
            $v = $stored[$slot] ?? null;
            $out[$slot] = is_string($v) && preg_match('/^#[0-9A-Fa-f]{6}$/', $v)
                ? $v
                : self::DEFAULT_HEX_BY_SLOT[$slot];
        }

        return $out;
    }

    /**
     * Partial update. Use null for a slot to clear stored override (defaults apply in {@see getColors()}).
     *
     * @param  array<string, string|null>  $partial
     * @return array<string, string>
     */
    public function setColors(int $accountId, array $partial): array
    {
        foreach ($partial as $slot => $hex) {
            if (! is_string($slot) || ! in_array($slot, self::SLOTS, true)) {
                throw new InvalidArgumentException('invalid_color_slot');
            }
            if ($hex !== null && (! is_string($hex) || ! preg_match('/^#[0-9A-Fa-f]{6}$/', $hex))) {
                throw new InvalidArgumentException('invalid_hex');
            }
        }

        /** @var Account|null $account */
        $account = Account::query()->where('account_id', $accountId)->first();
        if ($account === null) {
            throw new InvalidArgumentException('unknown_account');
        }

        $current = [];
        if (is_array($account->cosmetic_colors)) {
            $current = $account->cosmetic_colors;
        }

        foreach ($partial as $slot => $hex) {
            if ($hex === null) {
                unset($current[$slot]);
            } else {
                $current[$slot] = $hex;
            }
        }

        Account::query()->where('account_id', $accountId)->update([
            'cosmetic_colors' => $current === [] ? null : $current,
        ]);

        return $this->getColors($accountId);
    }

    /**
     * @return array<string, array{item_def_id: int, code: string, name: string, cosmetic_slot: string|null}|null>
     */
    public function getLoadout(int $accountId): array
    {
        $out = [];
        foreach (self::SLOTS as $slot) {
            $out[$slot] = null;
        }

        $rows = DB::table('account_cosmetic_equipment as e')
            ->join('item_defs as d', 'd.item_def_id', '=', 'e.item_def_id')
            ->where('e.account_id', $accountId)
            ->select([
                'e.slot',
                'd.item_def_id',
                'd.code',
                'd.name',
                'd.cosmetic_slot',
            ])
            ->get();

        foreach ($rows as $row) {
            $slot = (string) $row->slot;
            if (! in_array($slot, self::SLOTS, true)) {
                continue;
            }
            $out[$slot] = [
                'item_def_id' => (int) $row->item_def_id,
                'code' => (string) $row->code,
                'name' => (string) $row->name,
                'cosmetic_slot' => $row->cosmetic_slot !== null ? (string) $row->cosmetic_slot : null,
            ];
        }

        return $out;
    }

    /**
     * Partial update: only keys present in $slots are applied. Use null to clear a slot.
     *
     * @param  array<string, int|null>  $slots
     * @return array<string, array{item_def_id: int, code: string, name: string, cosmetic_slot: string|null}|null>
     */
    public function setLoadout(int $accountId, array $slots): array
    {
        DB::transaction(function () use ($accountId, $slots): void {
            foreach ($slots as $slot => $value) {
                if (! is_string($slot) || ! in_array($slot, self::SLOTS, true)) {
                    throw new InvalidArgumentException('invalid_slot');
                }
                if ($value === null) {
                    DB::table('account_cosmetic_equipment')
                        ->where('account_id', $accountId)
                        ->where('slot', $slot)
                        ->delete();

                    continue;
                }
                if (! is_int($value)) {
                    throw new InvalidArgumentException('invalid_item_def_id');
                }

                /** @var ItemDef|null $def */
                $def = ItemDef::query()->where('item_def_id', $value)->first();
                if ($def === null) {
                    throw new InvalidArgumentException('unknown_item');
                }
                if ($def->kind !== 'cosmetic') {
                    throw new InvalidArgumentException('not_cosmetic');
                }
                if ($def->cosmetic_slot !== $slot) {
                    throw new InvalidArgumentException('slot_mismatch');
                }
                if (! $this->accountOwnsItemDef($accountId, $value)) {
                    throw new InvalidArgumentException('not_owned');
                }

                DB::table('account_cosmetic_equipment')->updateOrInsert(
                    ['account_id' => $accountId, 'slot' => $slot],
                    ['item_def_id' => $value, 'updated_at' => now()]
                );
            }
        });

        return $this->getLoadout($accountId);
    }

    /**
     * Equip one item per wearable slot using {@see StarterCosmeticGrantService::STARTER_CODES} (Campus default outfit).
     * Caller should ensure those item_defs exist and the account owns them (e.g. after grant).
     *
     * @return array<string, array{item_def_id: int, code: string, name: string, cosmetic_slot: string|null}|null>
     */
    public function equipDefaultStarterLook(int $accountId): array
    {
        $slots = [];
        foreach (StarterCosmeticGrantService::STARTER_CODES as $code) {
            /** @var ItemDef|null $def */
            $def = ItemDef::query()->where('code', $code)->first();
            if ($def === null || $def->cosmetic_slot === null) {
                continue;
            }
            $slots[$def->cosmetic_slot] = (int) $def->item_def_id;
        }
        if ($slots === []) {
            throw new InvalidArgumentException('no_starter_defs');
        }

        return $this->setLoadout($accountId, $slots);
    }

    private function accountOwnsItemDef(int $accountId, int $itemDefId): bool
    {
        $gift = GiftInbox::query()->where('account_id', $accountId)->first();
        if ($gift === null) {
            return false;
        }
        $containerId = (int) $gift->container_id;

        $stackQty = (int) (DB::table('inventory_stacks')
            ->where('container_id', $containerId)
            ->where('item_def_id', $itemDefId)
            ->value('quantity') ?? 0);
        if ($stackQty > 0) {
            return true;
        }

        $instanceCount = (int) DB::table('item_instances')
            ->where('container_id', $containerId)
            ->where('item_def_id', $itemDefId)
            ->whereNotNull('owner_account_id')
            ->count();

        return $instanceCount > 0;
    }
}
