<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Prunable;

class IpReputation extends Model
{
    use Prunable;

    protected $table = 'ip_reputations';

    protected $primaryKey = 'ip';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'ip',
        'abuse_confidence',
        'country',
        'isp',
        'usage_type',
        'is_tor',
        'total_reports',
        'checked_at',
    ];

    protected function casts(): array
    {
        return [
            'abuse_confidence' => 'integer',
            'is_tor' => 'boolean',
            'total_reports' => 'integer',
            'checked_at' => 'datetime',
        ];
    }

    public function prunable(): Builder
    {
        return static::where('checked_at', '<', now()->subDays(SecurityEvent::RETENTION_DAYS));
    }
}
