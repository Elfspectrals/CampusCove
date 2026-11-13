<?php

namespace App\Listeners;

use App\Events\CounterBumped;
use App\Services\TutorialService;

final class AdvanceTutorial
{
    public function __construct(private readonly TutorialService $tutorial) {}

    public function handle(CounterBumped $event): void
    {
        $this->tutorial->onCounterBumped($event->accountId, $event->counter, $event->after);
    }
}
