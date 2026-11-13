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

    /** @return list<array{code: string, name: string, kind: string}> */
    public function grantable(): array
    {
        return ItemDef::query()
            ->whereNot(fn (Builder $query) => $query->boughtWithGems())
            ->orderBy('kind')
            ->orderBy('name')
            ->get(['code', 'name', 'kind'])
            ->map(fn (ItemDef $def): array => ['code' => $def->code, 'name' => $def->name, 'kind' => $def->kind])
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
