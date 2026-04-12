<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Container extends Model
{
    protected $table = 'containers';

    protected $primaryKey = 'container_id';

    public $incrementing = true;

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    protected $fillable = [
        'type',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }
}
