<?php

namespace App\Services;

use App\Enums\ActionCounter;
use App\Exceptions\PetanqueTallyRejectedException;
use Illuminate\Support\Facades\DB;

class PetanqueTallyService
{
    public const GAMES_PER_DAY = 5;

    public const MAX_CARREAUX_PER_GAME = 30;

    public const DAY_TIMEZONE = 'Europe/Paris';

    public function __construct(private readonly ActionCounterService $counters) {}

    public function tally(int $accountId, string $ref, int $carreaux): bool
    {
        $match = DB::table('sports_matches')->where('ref', $ref)->where('sport', 'petanque')->first(['id', 'counts_for_tasks']);
        if ($match === null) {
            throw new PetanqueTallyRejectedException('petanque_match_unknown', 'No recorded pétanque game with this ref.', 409);
        }
        if (! DB::table('sports_match_players')->where('match_id', $match->id)->where('account_id', $accountId)->exists()) {
            throw new PetanqueTallyRejectedException('petanque_not_in_match', 'This account did not play this pétanque game.', 409);
        }
        if (! $match->counts_for_tasks) {
            return false;
        }

        return DB::transaction(function () use ($accountId, $ref, $carreaux): bool {
            DB::table('accounts')->where('account_id', $accountId)->lockForUpdate()->first();
            $counted = DB::table('account_counter_keys')
                ->where('account_id', $accountId)
                ->where('counter', ActionCounter::PetanqueGames->value);
            if ((clone $counted)->where('key', 'like', '%:'.$ref)->exists()) {
                return false;
            }
            $today = now(self::DAY_TIMEZONE)->toDateString();
            if ((clone $counted)->where('key', 'like', $today.':%')->count() >= self::GAMES_PER_DAY) {
                return false;
            }
            $this->counters->bumpOncePerKey($accountId, ActionCounter::PetanqueGames, $today.':'.$ref);
            if ($carreaux > 0) {
                $this->counters->bump($accountId, ActionCounter::PetanqueCarreaux, $carreaux);
            }

            return true;
        });
    }
}
