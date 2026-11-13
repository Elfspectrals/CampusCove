<?php

namespace App\Events;

use App\Enums\ActionCounter;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

final class CounterBumped implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly int $accountId,
        public readonly ActionCounter $counter,
        public readonly int $before,
        public readonly int $after,
    ) {}
}
