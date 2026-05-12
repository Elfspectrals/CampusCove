<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoomFurnitureContainer extends Model
{
    protected $table = 'room_furniture_containers';

    protected $primaryKey = 'room_id';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'room_id',
        'container_id',
    ];

    protected function casts(): array
    {
        return [
            'room_id' => 'integer',
            'container_id' => 'integer',
        ];
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class, 'room_id', 'room_id');
    }

    public function container(): BelongsTo
    {
        return $this->belongsTo(Container::class, 'container_id', 'container_id');
    }
}

