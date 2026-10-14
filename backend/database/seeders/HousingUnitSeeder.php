<?php

namespace Database\Seeders;

use App\Models\HousingUnit;
use Illuminate\Database\Seeder;

class HousingUnitSeeder extends Seeder
{
    public function run(): void
    {
        if (HousingUnit::query()->exists()) {
            return;
        }

        $buyPositions = [
            [-9, 1.25, 12],
            [-3, 1.25, 12],
            [3, 1.25, 12],
            [9, 1.25, 12],
        ];

        foreach ($buyPositions as [$x, $y, $z]) {
            HousingUnit::query()->create([
                'offer_type' => 'buy',
                'price_coins' => 500,
                'rent_duration_hours' => 24,
                'pos_x' => $x,
                'pos_y' => $y,
                'pos_z' => $z,
                'size' => 2.5,
                'base_color_hex' => '#3D7EA6',
                'status' => 'vacant',
            ]);
        }

        $rentPositions = [
            [-9, 1.25, 18],
            [-3, 1.25, 18],
            [3, 1.25, 18],
            [9, 1.25, 18],
        ];

        foreach ($rentPositions as [$x, $y, $z]) {
            HousingUnit::query()->create([
                'offer_type' => 'rent',
                'price_coins' => 80,
                'rent_duration_hours' => 24,
                'pos_x' => $x,
                'pos_y' => $y,
                'pos_z' => $z,
                'size' => 2.5,
                'base_color_hex' => '#C47A3A',
                'status' => 'vacant',
            ]);
        }
    }
}
