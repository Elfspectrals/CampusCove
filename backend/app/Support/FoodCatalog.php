<?php

namespace App\Support;

/**
 * Food and drinks (item kind 'consumable'). Values are per portion: an item with 4 portions is eaten in four
 * bites (4/4 -> 3/4 -> ...). Assets: front/public/assets/items/<group>/<asset>/{model.glb,preview.png}
 * (map-src/CampusCove/build_food_items.py, build_sweets_items.py). `price` = coins at the counter that sells the
 * group (Campus Cafe for `food`, Cove Clinic for `medical`, Candy Cloud for `sweets`), null = not sold.
 */
final class FoodCatalog
{
    public const EFFECT_SPEED_BOOST = 'speed_boost';

    public const EFFECT_FOOD_POISONING = 'food_poisoning';

    public const EFFECT_HEAL_OVER_TIME = 'heal_over_time';

    /** Raw item => what cooking it on a stove or a barbecue gives. */
    public const COOKING = [
        'food_fish_raw' => 'food_fish_grilled',
    ];

    /**
     * @return list<array{code: string, name: string, asset: string, portions: int, hunger: int, thirst: int,
     *   health: int, effect: string|null, price: int|null, group: string, alcohol: int}>
     */
    public static function items(): array
    {
        return [
            self::item('food_coffee', 'Latte', 'coffee', 2, 0, 15, 0, self::EFFECT_SPEED_BOOST, 15),
            self::item('food_orange_juice', 'Orange Juice', 'orange_juice', 2, 3, 12, 0, null, 14),
            self::item('food_water_bottle', 'Water Bottle', 'water_bottle', 4, 0, 12, 0, null, 8),
            self::item('food_croissant', 'Croissant', 'croissant', 2, 10, 0, 0, null, 12),
            self::item('food_sandwich', 'Club Sandwich', 'sandwich', 4, 12, 0, 1, null, 30),
            self::item('food_cookie', 'Cookie', 'cookie', 1, 6, 0, 0, null, 5),
            self::item('food_fish_raw', 'Raw Fish', 'fish_raw', 2, 5, 0, 0, self::EFFECT_FOOD_POISONING, null),
            self::item('food_fish_grilled', 'Grilled Fish', 'fish_grilled', 4, 12, 0, 3, null, null),
            self::item('med_bandage', 'Bandage', 'bandage', 1, 0, 0, 15, null, 10, 'medical'),
            self::item('med_painkillers', 'Painkillers', 'painkillers', 1, 0, 0, 30, self::EFFECT_HEAL_OVER_TIME, 20, 'medical'),
            self::item('med_medkit', 'Medkit', 'medkit', 1, 0, 0, 60, null, 50, 'medical'),
            self::item('candy_cotton', 'Cotton Candy', 'cotton_candy', 2, 4, 0, 0, self::EFFECT_SPEED_BOOST, 12, 'sweets'),
            self::item('candy_lollipop', 'Swirl Lollipop', 'lollipop', 1, 3, 0, 0, null, 6, 'sweets'),
            self::item('candy_bag', 'Gummy Bag', 'candy_bag', 4, 4, 0, 0, null, 14, 'sweets'),
            self::item('candy_licorice', 'Licorice Twists', 'licorice', 3, 3, 0, 0, null, 9, 'sweets'),
            self::item('candy_gum', 'Bubble Gum', 'bubble_gum', 5, 1, 0, 0, null, 5, 'sweets'),
            self::item('candy_apple', 'Candy Apple', 'candy_apple', 2, 6, 0, 0, self::EFFECT_SPEED_BOOST, 15, 'sweets'),
            self::item('drink_stout', 'Pint of Stout', 'stout', 3, 0, 8, 0, null, 25, 'drinks', 8),
            self::item('drink_lager', 'Pint of Lager', 'lager', 3, 0, 8, 0, null, 22, 'drinks', 7),
            self::item('drink_red_wine', 'Red Wine', 'red_wine', 2, 0, 4, 0, null, 30, 'drinks', 10),
            self::item('drink_whisky', 'Whisky', 'whisky', 1, 0, 0, 0, null, 40, 'drinks', 25),
            self::item('drink_vodka', 'Vodka Shot', 'vodka', 1, 0, 0, 0, null, 35, 'drinks', 25),
        ];
    }

    /** @return array{code: string, name: string, asset: string, portions: int, hunger: int, thirst: int, health: int, effect: string|null, price: int|null, group: string, alcohol: int} */
    private static function item(string $code, string $name, string $asset, int $portions, int $hunger, int $thirst, int $health, ?string $effect, ?int $price, string $group = 'food', int $alcohol = 0): array
    {
        return compact('code', 'name', 'asset', 'portions', 'hunger', 'thirst', 'health', 'effect', 'price', 'group', 'alcohol');
    }
}
