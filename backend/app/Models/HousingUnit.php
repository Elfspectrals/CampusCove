<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HousingUnit extends Model
{
    protected $table = 'housing_units';

    protected $primaryKey = 'unit_id';

    protected $fillable = [
        'public_id',
        'offer_type',
        'price_coins',
        'tax_coins',
        'rent_duration_hours',
        'pos_x',
        'pos_y',
        'pos_z',
        'size',
        'base_color_hex',
        'model_key',
        'status',
        'occupant_account_id',
        'interior_bounds',
        'lease_expires_at',
        'tax_due_at',
        'door_locked',
        'room_id',
    ];

    protected function casts(): array
    {
        return [
            'unit_id' => 'integer',
            'price_coins' => 'integer',
            'tax_coins' => 'integer',
            'rent_duration_hours' => 'integer',
            'pos_x' => 'float',
            'pos_y' => 'float',
            'pos_z' => 'float',
            'size' => 'float',
            'occupant_account_id' => 'integer',
            'room_id' => 'integer',
            'lease_expires_at' => 'datetime',
            'tax_due_at' => 'datetime',
            'door_locked' => 'boolean',
            'interior_bounds' => 'array',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function occupant(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'occupant_account_id', 'account_id');
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class, 'room_id', 'room_id');
    }

    public function templateKey(): string
    {
        return 'housing_'.$this->unit_id;
    }
}
