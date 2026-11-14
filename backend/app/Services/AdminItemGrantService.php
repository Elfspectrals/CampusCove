<?php

namespace App\Services;

use App\Exceptions\AdminGrantRejectedException;
use App\Models\ItemDef;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

final class AdminItemGrantService
{
    public function __construct(private readonly AccountInventoryService $inventory) {}

    /**
     * The picker of the admin give screen: a picture, and what one portion restores for food and drinks.
     *
     * @return list<array{code: string, name: string, kind: string, preview: string|null, portion: array{hunger: int, thirst: int, health: int}|null}>
     */
    public function grantable(): array
    {
        return ItemDef::query()
            ->whereNot(fn (Builder $query) => $query->boughtWithGems())
            ->orderBy('kind')
            ->orderBy('name')
            ->get(['code', 'name', 'kind', 'preview_image', 'hunger_per_portion', 'thirst_per_portion', 'health_per_portion'])
            ->map(fn (ItemDef $def): array => [
                'code' => $def->code,
                'name' => $def->name,
                'kind' => $def->kind,
                'preview' => $def->preview_image,
                'portion' => $def->kind === 'consumable' ? [
                    'hunger' => (int) $def->hunger_per_portion,
                    'thirst' => (int) $def->thirst_per_portion,
                    'health' => (int) $def->health_per_portion,
                ] : null,
            ])
            ->all();
    }

    public function grant(int $adminAccountId, int $toAccountId, string $code, int $quantity, string $ref): void
    {
        $def = ItemDef::query()->where('code', $code)->firstOrFail();
        if (ItemDef::query()->whereKey($def->item_def_id)->boughtWithGems()->exists()) {
            throw new AdminGrantRejectedException('admin_item_premium', 'Items bought with gems cannot be given.');
        }

        DB::transaction(function () use ($adminAccountId, $toAccountId, $def, $quantity, $ref): void {
            try {
                DB::table('admin_item_grants')->insert([
                    'ref' => $ref,
                    'admin_account_id' => $adminAccountId,
                    'to_account_id' => $toAccountId,
                    'item_def_id' => $def->item_def_id,
                    'quantity' => $quantity,
                ]);
            } catch (UniqueConstraintViolationException) {
                throw new AdminGrantRejectedException('admin_grant_already_done', 'This grant was already done.', 409);
            }
            $this->inventory->grantItem($toAccountId, $def, $quantity);
        });
    }
}
