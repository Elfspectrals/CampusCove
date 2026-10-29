<?php

use App\Http\Controllers\AccountPrivacyController;
use App\Http\Controllers\AdminInventoryController;
use App\Http\Controllers\AdminShopItemController;
use App\Http\Controllers\AdminUserController;
use App\Http\Controllers\ApartmentPlacementController;
use App\Http\Controllers\AssetController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CharacterCosmeticController;
use App\Http\Controllers\FriendController;
use App\Http\Controllers\HousingController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\PlayerInventoryLayoutController;
use App\Http\Controllers\PlayerReportController;
use App\Http\Controllers\ReferralController;
use App\Http\Controllers\ShopController;
use App\Http\Controllers\SurvivalController;
use App\Http\Controllers\TradeController;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json(['status' => 'ok', 'app' => 'CampusCove API']);
});

// brute-force / spam protection: per IP, per minute
Route::middleware('throttle:10,1')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/reset-password', [AuthController::class, 'resetPassword']);
});

Route::get('/shop/items', [ShopController::class, 'index']);
Route::get('/assets/public/{path}', [AssetController::class, 'publicDisk'])->where('path', '.*');

Route::middleware(['auth:sanctum', 'account.active'])->group(function () {
    Route::get('/user', [AuthController::class, 'user']);
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/account/export', [AccountPrivacyController::class, 'export'])->middleware('throttle:5,1');
    Route::delete('/account', [AccountPrivacyController::class, 'destroy'])->middleware('throttle:5,1');
    Route::post('/account/terms', [AccountPrivacyController::class, 'acceptTerms']);
    Route::post('/reports', [PlayerReportController::class, 'store'])->middleware('throttle:10,1');

    Route::get('/friends', [FriendController::class, 'index']);
    Route::get('/friends/pending', [FriendController::class, 'pending']);
    Route::post('/friends/request', [FriendController::class, 'request']);
    Route::post('/friends/accept/{accountId}', [FriendController::class, 'accept']);
    Route::post('/friends/block/{accountId}', [FriendController::class, 'block']);
    Route::delete('/friends/{accountId}', [FriendController::class, 'destroy']);

    Route::get('/referrals', [ReferralController::class, 'show']);

    Route::get('/housing/units', [HousingController::class, 'index']);
    Route::post('/housing/units/{publicId}/buy', [HousingController::class, 'buy']);
    Route::post('/housing/keys', [HousingController::class, 'giveKeys']);
    Route::put('/housing/units/{publicId}/door', [HousingController::class, 'setDoorLocked']);
    Route::delete('/housing/keys/{accountId}', [HousingController::class, 'takeKeys'])->whereNumber('accountId');

    Route::get('/survival', [SurvivalController::class, 'show']);
    Route::middleware('realtime')->group(function () {
        Route::put('/survival', [SurvivalController::class, 'update']);
        Route::post('/survival/consume', [SurvivalController::class, 'consume']);
        Route::post('/survival/cook', [SurvivalController::class, 'cook']);
        Route::post('/survival/hospital', [SurvivalController::class, 'hospital']);
        Route::post('/survival/clinic-heal', [SurvivalController::class, 'clinicHeal']);
        Route::post('/trades/execute', [TradeController::class, 'execute']);
    });
    Route::get('/trades/offerable', [TradeController::class, 'offerable']);

    Route::post('/shop/purchase', [ShopController::class, 'purchase']);
    Route::post('/shop/checkout', [ShopController::class, 'checkout']);
    Route::get('/inventory', [InventoryController::class, 'index']);
    Route::get('/inventory/layout', [PlayerInventoryLayoutController::class, 'show']);
    Route::put('/inventory/layout', [PlayerInventoryLayoutController::class, 'update']);

    Route::get('/character/cosmetics', [CharacterCosmeticController::class, 'show']);
    Route::put('/character/cosmetics', [CharacterCosmeticController::class, 'update']);
    Route::get('/apartments/assets', [ApartmentPlacementController::class, 'inventory']);
    Route::get('/apartments/houses', [ApartmentPlacementController::class, 'houses']);
    Route::post('/apartments/state', [ApartmentPlacementController::class, 'state']);
    Route::post('/apartments/spawn', [ApartmentPlacementController::class, 'spawn']);
    Route::patch('/apartments/transform', [ApartmentPlacementController::class, 'transform']);
    Route::post('/apartments/pickup', [ApartmentPlacementController::class, 'pickup']);

    Route::middleware('admin')->prefix('admin')->group(function () {
        Route::get('/reports', [PlayerReportController::class, 'index']);
        Route::patch('/reports/{id}', [PlayerReportController::class, 'update'])->whereNumber('id');

        Route::prefix('users')->group(function () {
            Route::get('/', [AdminUserController::class, 'index']);
            Route::get('/{accountId}', [AdminUserController::class, 'show']);
            Route::post('/', [AdminUserController::class, 'store']);
            Route::patch('/{accountId}', [AdminUserController::class, 'update']);
            Route::delete('/{accountId}', [AdminUserController::class, 'destroy']);
            Route::post('/{accountId}/restore', [AdminUserController::class, 'restore']);
            Route::post('/{accountId}/suspend', [AdminUserController::class, 'suspend']);
            Route::post('/{accountId}/unsuspend', [AdminUserController::class, 'unsuspend']);
            Route::post('/{accountId}/ban', [AdminUserController::class, 'ban']);
            Route::post('/{accountId}/unban', [AdminUserController::class, 'unban']);
            Route::post('/{accountId}/reset-password', [AdminUserController::class, 'resetPassword']);
        });

        Route::prefix('shop')->group(function () {
            Route::get('/items', [AdminShopItemController::class, 'index']);
            Route::post('/items', [AdminShopItemController::class, 'store']);
            Route::post('/items/bulk', [AdminShopItemController::class, 'bulk']);
            Route::put('/items/{shop_catalog_item}', [AdminShopItemController::class, 'update']);
            Route::patch('/items/{shop_catalog_item}', [AdminShopItemController::class, 'update']);
            Route::delete('/items/{shop_catalog_item}', [AdminShopItemController::class, 'destroy']);
        });

        Route::prefix('inventories')->group(function () {
            Route::get('/players', [AdminInventoryController::class, 'players']);
            Route::get('/{accountId}', [AdminInventoryController::class, 'show']);
            Route::post('/{accountId}/grant', [AdminInventoryController::class, 'grant']);
            Route::post('/{accountId}/revoke', [AdminInventoryController::class, 'revoke']);
            Route::post('/{accountId}/set-quantity', [AdminInventoryController::class, 'setQuantity']);
            Route::post('/{accountId}/equip', [AdminInventoryController::class, 'equip']);
            Route::post('/{accountId}/reset', [AdminInventoryController::class, 'reset']);
        });
    });
});
