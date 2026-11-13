<?php

namespace App\Enums;

enum ActionCounter: string
{
    case ApplesPicked = 'apples_picked';
    case ApplesSold = 'apples_sold';
    case FoodEaten = 'food_eaten';
    case AtmDeposits = 'atm_deposits';
    case DartsPlayed = 'darts_played';
}
