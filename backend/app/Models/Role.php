<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Role extends Model
{
    public const NAME_ADMIN = 'admin';

    protected $table = 'roles';

    protected $primaryKey = 'role_id';

    public $timestamps = false;

    protected $fillable = [
        'name',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function accounts(): BelongsToMany
    {
        return $this->belongsToMany(Account::class, 'account_roles', 'role_id', 'account_id')
            ->withTimestamps(false);
    }
}
