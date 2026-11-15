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
    case PubOrderDays = 'pub_order_days';
    case PubGames = 'pub_games';
    case DuelsWon = 'duels_won';
    case SecretRoomWeeks = 'secret_room_weeks';
    case FootballMatches = 'football_matches';
    case BasketballMatches = 'basketball_matches';
    case HatTricks = 'hat_tricks';
    case SharpshooterMatches = 'sharpshooter_matches';
    case RacesRun = 'races_run';
    case Fast400Runs = 'fast_400_runs';
    case TennisMatches = 'tennis_matches';
    case TennisWhitewashes = 'tennis_whitewashes';
    case SongsDanced = 'songs_danced';
    case FullComboHard = 'full_combo_hard';
    case ClimbLinesTopped = 'climb_lines_topped';
    case BlackLinesTopped = 'black_lines_topped';
}
