<?php

namespace App\Services;

use App\Exceptions\ZoneShopRejectedException;
use RuntimeException;

final class ZonePriceBook
{
    /** @return array<string, int> item code => coins */
    public function prices(string $zone): array
    {
        return $this->book($zone)['prices'];
    }

    /** @return array{price: int, quota: int, overPrice: int} */
    public function buyerOffer(string $zone, string $area, string $code): array
    {
        $offer = $this->book($zone)['buyers'][$area][$code] ?? null;
        if ($offer === null) {
            throw new ZoneShopRejectedException('not_bought_here', 'Nobody buys this here.', 422);
        }

        return $offer;
    }

    /** @return array{prices: array<string, int>, buyers: array<string, array<string, array{price: int, quota: int, overPrice: int}>>} */
    private function book(string $zone): array
    {
        $path = resource_path("zones/{$zone}.json");
        if (preg_match('/^[a-z0-9_]+$/', $zone) !== 1 || ! is_file($path)) {
            throw new ZoneShopRejectedException('unknown_zone', 'Nothing is sold in this zone.', 404);
        }
        $book = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        if (! is_array($book) || ($book['version'] ?? null) !== 1 || ($book['zone'] ?? null) !== $zone || ! is_array($book['prices'] ?? null) || ! is_array($book['buyers'] ?? null)) {
            throw new RuntimeException("resources/zones/{$zone}.json is not a zone price list");
        }
        foreach ($book['prices'] as $code => $price) {
            if (! is_string($code) || ! is_int($price) || $price < 1) {
                throw new RuntimeException("resources/zones/{$zone}.json: invalid price for {$code}");
            }
        }
        foreach ($book['buyers'] as $area => $offers) {
            foreach (is_array($offers) ? $offers : [null] as $code => $offer) {
                $valid = is_array($offer) && is_int($offer['price'] ?? null) && is_int($offer['quota'] ?? null) && is_int($offer['overPrice'] ?? null)
                    && $offer['price'] >= 1 && $offer['quota'] >= 0 && $offer['overPrice'] >= 0 && $offer['overPrice'] <= $offer['price'];
                if (! $valid) {
                    throw new RuntimeException("resources/zones/{$zone}.json: invalid offer of {$area} for {$code}");
                }
            }
        }

        return $book;
    }
}
