<?php

namespace App\Listeners;

use App\Events\CounterBumped;
use App\Services\TaskProgressService;

final class RecordTaskTiers
{
    public function __construct(private readonly TaskProgressService $tasks) {}

    public function handle(CounterBumped $event): void
    {
        $this->tasks->recordReachedTiers($event->accountId, $event->counter, $event->after);
    }
}
