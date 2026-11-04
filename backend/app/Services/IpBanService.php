<?php

namespace App\Services;

use App\Models\IpBan;
use App\Models\SecurityEvent;

class IpBanService
{
    public const SCORE_WINDOW_HOURS = 24;

    public const MAX_SCORE = 100;

    public const AUTO_BAN_SCORE = 80;

    public const AUTO_BAN_HOURS = 24;

    public const SCORE_CAP_WITHOUT_BOT_SIGNAL = self::AUTO_BAN_SCORE - 1;

    public const WEIGHTS = [
        SecurityEvent::TYPE_LOGIN_FAILED => 4,
        SecurityEvent::TYPE_RATE_LIMITED => 10,
        SecurityEvent::TYPE_PROBE_PATH => 20,
        SecurityEvent::TYPE_INJECTION => 25,
        SecurityEvent::TYPE_SCANNER_AGENT => 50,
    ];

    public const BOT_SIGNALS = [
        SecurityEvent::TYPE_PROBE_PATH,
        SecurityEvent::TYPE_INJECTION,
        SecurityEvent::TYPE_SCANNER_AGENT,
    ];

    public function __construct(private readonly RealtimeNotifier $realtime) {}

    public function score(string $ip): int
    {
        $countsByType = SecurityEvent::query()
            ->where('ip', $ip)
            ->where('created_at', '>', now()->subHours(self::SCORE_WINDOW_HOURS))
            ->groupBy('type')
            ->selectRaw('type, COUNT(*) AS events')
            ->pluck('events', 'type');

        $score = 0;
        foreach ($countsByType as $type => $events) {
            $score += self::WEIGHTS[$type] * $events;
        }
        $score = min($score, self::MAX_SCORE);

        $hasBotSignal = $countsByType->keys()->intersect(self::BOT_SIGNALS)->isNotEmpty();

        return $hasBotSignal ? $score : min($score, self::SCORE_CAP_WITHOUT_BOT_SIGNAL);
    }

    public function isBanned(string $ip): bool
    {
        return IpBan::active()->where('ip', $ip)->exists();
    }

    public function banIfOverThreshold(string $ip): void
    {
        if ($this->isBanned($ip)) {
            return;
        }

        $score = $this->score($ip);
        if ($score < self::AUTO_BAN_SCORE) {
            return;
        }

        IpBan::create([
            'ip' => $ip,
            'reason' => IpBan::REASON_AUTO,
            'score' => $score,
            'expires_at' => now()->addHours(self::AUTO_BAN_HOURS),
        ]);
        $this->realtime->ipBanned($ip);
    }

    public function unban(string $ip): int
    {
        return IpBan::active()->where('ip', $ip)->update(['lifted_at' => now()]);
    }
}
