<?php

namespace App\Services;

use App\Enums\ActionCounter;
use App\Exceptions\PetanqueTallyRejectedException;
use App\Models\Account;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class PetanqueTallyService
{
    public const GAMES_PER_DAY = 5;

    public const MAX_CARREAUX_PER_GAME = 30;

    public const DAY_TIMEZONE = 'Europe/Paris';

    public function __construct(private readonly ActionCounterService $counters) {}

    public function tally(int $accountId, string $ref, int $carreaux): bool
    {
        $players = $this->playersOf($ref);
        if (! $players->contains('account_id', $accountId)) {
            throw new PetanqueTallyRejectedException('petanque_not_in_match', 'This account did not play this pétanque game.', 409);
        }
        if (! $this->bothTeamsHaveAnOldAccount($players->all())) {
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

    /** @return Collection<int, object{account_id: int, team: string|null}> */
    private function playersOf(string $ref)
    {
        $match = DB::table('sports_matches')->where('ref', $ref)->where('sport', 'petanque')->first();
        if ($match === null) {
            throw new PetanqueTallyRejectedException('petanque_match_unknown', 'No recorded pétanque game with this ref.', 409);
        }

        return DB::table('sports_match_players')->where('match_id', $match->id)->get(['account_id', 'team']);
    }

    /** @param  array<int, object{account_id: int, team: string|null}>  $players */
    private function bothTeamsHaveAnOldAccount(array $players): bool
    {
        $old = Account::query()
            ->whereKey(array_map(fn (object $p): int => (int) $p->account_id, $players))
            ->where('created_at', '<=', now()->subHours(TradeService::MIN_GIVER_AGE_HOURS))
            ->pluck('account_id')
            ->map(fn ($id): int => (int) $id)
            ->all();
        foreach (['red', 'blue'] as $team) {
            $hasOld = array_filter($players, fn (object $p): bool => $p->team === $team && in_array((int) $p->account_id, $old, true));
            if ($hasOld === []) {
                return false;
            }
        }

        return true;
    }
}
