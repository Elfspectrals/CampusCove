<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SecurityScan extends Model
{
    public const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];

    protected $table = 'security_scans';

    public $timestamps = false;

    protected $fillable = [
        'commit_sha',
        'ref',
        'scanned_at',
    ];

    protected function casts(): array
    {
        return [
            'scanned_at' => 'datetime',
        ];
    }

    public function vulnerabilities(): HasMany
    {
        return $this->hasMany(SecurityVulnerability::class, 'scan_id');
    }
}
