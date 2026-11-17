<?php

namespace App\Services;

use App\Enums\ActionCounter;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;

final class GymTaskService
{
    public const HAT_TRICK_GOALS = 3;

    public const SHARPSHOOTER_THREES = 5;

    private const PLAYED = ['football' => ActionCounter::FootballMatches, 'basketball' => ActionCounter::BasketballMatches];

    public function __construct(private readonly ActionCounterService $counters) {}

    /**
     * @param  list<array{accountId: int, goals?: int, threes?: int}>  $players
     * @return list<int>
     */
    public function countMatch(string $ref, string $sport, array $players): array
    {
        return DB::transaction(function () use ($ref, $sport, $players): array {
            $match = DB::table('sports_matches')->where('ref', $ref)->first(['id', 'sport']);
            if ($match === null) {
                throw new NotFoundHttpException("No recorded match {$ref}.");
            }
            if ($match->sport !== $sport) {
                throw new UnprocessableEntityHttpException("Match {$ref} is {$match->sport}, not {$sport}.");
            }
            $played = DB::table('sports_match_players')->where('match_id', $match->id)->where('result', '!=', 'dnf')->pluck('account_id')->map(fn ($id): int => (int) $id)->all();
            $counted = [];
            foreach ($players as $player) {
                if (! in_array($player['accountId'], $played, true)) {
                    continue;
                }
                $this->counters->bumpOncePerKey($player['accountId'], self::PLAYED[$sport], $ref);
                if ($this->featReached($sport, $player)) {
                    $this->counters->bumpOncePerKey($player['accountId'], $sport === 'football' ? ActionCounter::HatTricks : ActionCounter::SharpshooterMatches, $ref);
                }
                $counted[] = $player['accountId'];
            }

            return $counted;
        });
    }

    /** @param  array{accountId: int, goals?: int, threes?: int}  $player */
    private function featReached(string $sport, array $player): bool
    {
        return $sport === 'football'
            ? ($player['goals'] ?? 0) >= self::HAT_TRICK_GOALS
            : ($player['threes'] ?? 0) >= self::SHARPSHOOTER_THREES;
    }
}
