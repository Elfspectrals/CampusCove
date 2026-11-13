<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PubQuizWin extends Model
{
    protected $table = 'pub_quiz_wins';

    public $timestamps = false;

    protected $fillable = [
        'quiz_id',
        'account_id',
        'valid_contestants',
        'coins',
        'pint_expires_at',
        'pint_redeemed_at',
    ];

    protected function casts(): array
    {
        return [
            'account_id' => 'integer',
            'valid_contestants' => 'integer',
            'coins' => 'integer',
            'pint_expires_at' => 'datetime',
            'pint_redeemed_at' => 'datetime',
        ];
    }
}
