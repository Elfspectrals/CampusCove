<?php

namespace App\Services;

use App\Enums\ActionCounter;
use Closure;

final class SportsTaskCounters
{
    public const SWIM_FAST_50_MS = 30_000;

    public function __construct(private readonly ActionCounterService $counters) {}

    /**
     * @return array<string, array{played: ActionCounter, feat?: array{counter: ActionCounter, reached: Closure(array<string, string|int>, array{result: string, timeMs?: int|null}): bool}}>
     */
    public static function rules(): array
    {
        return [
            'swimming' => [
                'played' => ActionCounter::SwimRaces,
                'feat' => [
                    'counter' => ActionCounter::SwimFast50,
                    'reached' => static fn (array $settings, array $player): bool => ($settings['distanceM'] ?? null) === 50
                        && $player['result'] === 'finished'
                        && ($player['timeMs'] ?? null) !== null
                        && $player['timeMs'] < self::SWIM_FAST_50_MS,
                ],
            ],
        ];
    }

    /**
     * @param  array<string, string|int>  $settings
     * @param  list<array{accountId: int, result: string, timeMs?: int|null}>  $players
     */
    public function countMatch(string $sport, array $settings, array $players): void
    {
        $rule = self::rules()[$sport] ?? null;
        if ($rule === null) {
            return;
        }
        foreach ($players as $player) {
            if ($player['result'] === 'dnf') {
                continue;
            }
            $this->counters->bump($player['accountId'], $rule['played']);
            if (isset($rule['feat']) && ($rule['feat']['reached'])($settings, $player)) {
                $this->counters->bump($player['accountId'], $rule['feat']['counter']);
            }
        }
    }
}
