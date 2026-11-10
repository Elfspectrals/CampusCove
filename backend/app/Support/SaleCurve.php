<?php

namespace App\Support;

final class SaleCurve
{
    /** @return array{coins: int, full_price_left: int} */
    public static function payout(int $price, int $quota, int $overPrice, int $soldToday, int $quantity): array
    {
        $fullPriceLeft = max(0, $quota - $soldToday);
        $atFullPrice = min($quantity, $fullPriceLeft);

        return [
            'coins' => $atFullPrice * $price + ($quantity - $atFullPrice) * $overPrice,
            'full_price_left' => $fullPriceLeft - $atFullPrice,
        ];
    }
}
