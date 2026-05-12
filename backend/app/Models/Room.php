<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Room extends Model
{
    protected $table = 'rooms';

    protected $primaryKey = 'room_id';

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    protected $fillable = [
        'server_id',
        'type',
        'building_id',
        'owner_character_id',
        'name',
    ];

    protected function casts(): array
    {
        return [
            'room_id' => 'integer',
            'server_id' => 'integer',
            'building_id' => 'integer',
            'owner_character_id' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function furnitureContainer(): HasOne
    {
        return $this->hasOne(RoomFurnitureContainer::class, 'room_id', 'room_id');
    }

    public function furnitures(): HasMany
    {
        return $this->hasMany(RoomFurniture::class, 'room_id', 'room_id');
    }

    public function memberships(): HasMany
    {
        return $this->hasMany(RoomMembership::class, 'room_id', 'room_id');
    }
}

