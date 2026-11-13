<?php

namespace App\Enums;

enum ActionCounter: string
{
    case ApplesPicked = 'apples_picked';
    case ApplesSold = 'apples_sold';
    case FoodEaten = 'food_eaten';
    case AtmDeposits = 'atm_deposits';
    case DartsPlayed = 'darts_played';
    case DartsDuels80 = 'darts_duels_80';
    case FoodsTasted = 'foods_tasted';
}
