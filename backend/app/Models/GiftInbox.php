<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GiftInbox extends Model
{
    protected $table = 'gift_inboxes';

    protected $primaryKey = 'account_id';

    public $incrementing = false;

    protected $keyType = 'int';

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    protected $fillable = [
        'account_id',
        'container_id',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'account_id' => 'integer',
            'container_id' => 'integer',
        ];
    }

    public function container(): BelongsTo
    {
        return $this->belongsTo(Container::class, 'container_id', 'container_id');
    }
}
