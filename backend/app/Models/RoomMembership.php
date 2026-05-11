<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoomMembership extends Model
{
    protected $table = 'room_memberships';

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    protected $fillable = [
        'room_id',
        'account_id',
        'role',
    ];

    protected function casts(): array
    {
        return [
            'room_id' => 'integer',
            'account_id' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class, 'room_id', 'room_id');
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'account_id', 'account_id');
    }
}

