<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

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
}
