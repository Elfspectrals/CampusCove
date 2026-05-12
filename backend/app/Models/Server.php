<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Server extends Model
{
    protected $table = 'servers';

    protected $primaryKey = 'server_id';

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    protected $fillable = [
        'name',
        'is_enabled',
    ];

    protected function casts(): array
    {
        return [
            'server_id' => 'integer',
            'is_enabled' => 'boolean',
            'created_at' => 'datetime',
        ];
    }
}

