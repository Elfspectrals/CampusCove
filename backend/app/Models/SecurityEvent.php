<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Prunable;

class SecurityEvent extends Model
{
    use Prunable;

    public const TYPE_LOGIN_FAILED = 'login_failed';

    public const TYPE_RATE_LIMITED = 'rate_limited';

    public const TYPE_PROBE_PATH = 'probe_path';

    public const TYPE_SCANNER_AGENT = 'scanner_agent';

    public const TYPE_INJECTION = 'injection';

    // 404 on a path no route matches (/admin, /api/v1/users, /backup.zip): a scan, or a lost bot.
    public const TYPE_NOT_FOUND = 'not_found';

    public const RETENTION_DAYS = 30;

    const UPDATED_AT = null;

    protected $table = 'security_events';

    protected $fillable = [
        'ip',
        'country',
        'type',
        'method',
        'path',
        'user_agent',
        'detail',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function prunable(): Builder
    {
        return static::where('created_at', '<', now()->subDays(self::RETENTION_DAYS));
    }
}
