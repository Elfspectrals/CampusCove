<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoomFurniture extends Model
{
    protected $table = 'room_furnitures';

    protected $primaryKey = 'room_furniture_id';

    public $timestamps = false;

    const CREATED_AT = 'placed_at';

    protected $fillable = [
        'room_id',
        'item_instance_id',
        'pos_x',
        'pos_y',
        'pos_z',
        'rot_x',
        'rot_y',
        'rot_z',
        'scale_x',
        'scale_y',
        'scale_z',
        'state_json',
    ];

    protected function casts(): array
    {
        return [
            'room_furniture_id' => 'integer',
            'room_id' => 'integer',
            'item_instance_id' => 'integer',
            'pos_x' => 'float',
            'pos_y' => 'float',
            'pos_z' => 'float',
            'rot_x' => 'float',
            'rot_y' => 'float',
            'rot_z' => 'float',
            'scale_x' => 'float',
            'scale_y' => 'float',
            'scale_z' => 'float',
            'state_json' => 'array',
            'placed_at' => 'datetime',
        ];
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class, 'room_id', 'room_id');
    }

    public function itemInstance(): BelongsTo
    {
        return $this->belongsTo(ItemInstance::class, 'item_instance_id', 'item_instance_id');
    }
}

