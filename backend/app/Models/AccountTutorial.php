<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AccountTutorial extends Model
{
    protected $table = 'account_tutorials';

    protected $primaryKey = 'account_id';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'account_id',
        'step',
        'status',
        'step_baseline',
        'started_at',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'account_id' => 'integer',
            'step_baseline' => 'integer',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }
}
