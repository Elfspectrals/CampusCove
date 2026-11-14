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
        $def = $this->grantableDef($code, 'Items bought with gems cannot be given.');

        DB::transaction(function () use ($adminAccountId, $toAccountId, $def, $quantity, $ref): void {
            $this->log($adminAccountId, $toAccountId, $def, $quantity, $ref, 'give');
            $this->inventory->grantItem($toAccountId, $def, $quantity);
        });
    }

    /**
     * What an account holds that the admin may take back (never the items bought with gems).
     *
     * @return list<array{code: string, name: string, kind: string, preview: string|null, quantity: int}>
     */
    public function takeable(int $accountId): array
    {
        $gemCodes = ItemDef::query()->boughtWithGems()->pluck('code')->all();

        return $this->inventory->aggregatedItemsForAccount($accountId, null, null)
            ->reject(fn (object $row): bool => in_array($row->code, $gemCodes, true) || (int) $row->quantity <= 0)
            ->map(fn (object $row): array => [
                'code' => (string) $row->code,
                'name' => (string) $row->name,
                'kind' => (string) $row->kind,
                'preview' => $row->preview_image,
                'quantity' => (int) $row->quantity,
            ])
            ->values()
            ->all();
    }

    /** Removes items from an account; refused when it holds fewer. Logged like a grant, direction 'take'. */
    public function take(int $adminAccountId, int $fromAccountId, string $code, int $quantity, string $ref): void
    {
        $def = $this->grantableDef($code, 'Items bought with gems cannot be taken.');

        DB::transaction(function () use ($adminAccountId, $fromAccountId, $def, $quantity, $ref): void {
            $this->log($adminAccountId, $fromAccountId, $def, $quantity, $ref, 'take');
            $held = collect($this->takeable($fromAccountId))->firstWhere('code', $def->code)['quantity'] ?? 0;
            if ($held < $quantity) {
                throw new AdminGrantRejectedException('admin_take_too_many', "This player only has {$held}.");
            }
            $this->inventory->revokeItem($fromAccountId, $def, $quantity);
        });
    }

    private function grantableDef(string $code, string $premiumMessage): ItemDef
    {
        $def = ItemDef::query()->where('code', $code)->firstOrFail();
        if (ItemDef::query()->whereKey($def->item_def_id)->boughtWithGems()->exists()) {
            throw new AdminGrantRejectedException('admin_item_premium', $premiumMessage);
        }

        return $def;
    }

    private function log(int $adminAccountId, int $accountId, ItemDef $def, int $quantity, string $ref, string $direction): void
    {
        try {
            DB::table('admin_item_grants')->insert([
                'ref' => $ref,
                'admin_account_id' => $adminAccountId,
                'to_account_id' => $accountId,
                'item_def_id' => $def->item_def_id,
                'quantity' => $quantity,
                'direction' => $direction,
            ]);
        } catch (UniqueConstraintViolationException) {
            throw new AdminGrantRejectedException('admin_grant_already_done', 'This was already done.', 409);
        }
    }
}
