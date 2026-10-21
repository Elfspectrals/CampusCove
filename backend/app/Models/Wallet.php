<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\UniqueConstraintViolationException;

class Wallet extends Model
{
    public const OWNER_TYPE_ACCOUNT = 'account';

    protected $table = 'wallets';

    protected $primaryKey = 'wallet_id';

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    protected $fillable = [
        'owner_type',
        'owner_id',
        'currency',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'owner_id' => 'integer',
        ];
    }

    public function ledgerEntries(): HasMany
    {
        return $this->hasMany(WalletLedgerEntry::class, 'wallet_id', 'wallet_id');
    }

    public function ownerAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'owner_id', 'account_id');
    }

    /**
     * The account's wallet in that currency, created on first use and locked FOR UPDATE.
     * Call inside a transaction.
     */
    public static function lockForAccount(int $accountId, string $currency): self
    {
        $query = fn () => self::query()
            ->where('owner_type', self::OWNER_TYPE_ACCOUNT)
            ->where('owner_id', $accountId)
            ->where('currency', $currency)
            ->lockForUpdate();

        $wallet = $query()->first();
        if ($wallet !== null) {
            return $wallet;
        }

        try {
            return self::query()->create([
                'owner_type' => self::OWNER_TYPE_ACCOUNT,
                'owner_id' => $accountId,
                'currency' => $currency,
            ]);
        } catch (UniqueConstraintViolationException) {
            // Another concurrent request created the wallet.
        }

        return $query()->firstOrFail();
    }

    /** Current balance: the sum of the ledger. */
    public function balance(): int
    {
        return (int) WalletLedgerEntry::query()->where('wallet_id', $this->wallet_id)->sum('delta');
    }
}
