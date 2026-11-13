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
    case ZonesVisited = 'zones_visited';
    case ActiveDays = 'active_days';
    case FarmHarvests = 'farm_harvests';
    case ItemsSoldToBuyers = 'items_sold_to_buyers';
    case DishesCooked = 'dishes_cooked';
    case ShopBaskets = 'shop_baskets';
    case ClothesBought = 'clothes_bought';
}
