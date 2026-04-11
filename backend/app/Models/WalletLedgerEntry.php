<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WalletLedgerEntry extends Model
{
    protected $table = 'wallet_ledger';

    protected $primaryKey = 'entry_id';

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    protected $fillable = [
        'wallet_id',
        'tx_id',
        'delta',
        'reason',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'wallet_id' => 'integer',
            'tx_id' => 'integer',
            'delta' => 'integer',
        ];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class, 'wallet_id', 'wallet_id');
    }
}
