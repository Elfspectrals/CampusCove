<?php

use App\Http\Controllers\AdminInventoryController;
use App\Http\Controllers\AdminShopItemController;
use App\Http\Controllers\AdminUserController;
use App\Http\Controllers\AssetController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CharacterCosmeticController;
use App\Http\Controllers\FriendController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\ShopController;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json(['status' => 'ok', 'app' => 'CampusCove API']);
});

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);

Route::get('/shop/items', [ShopController::class, 'index']);
Route::get('/assets/public/{path}', [AssetController::class, 'publicDisk'])->where('path', '.*');

Route::middleware(['auth:sanctum', 'account.active'])->group(function () {
    Route::get('/user', [AuthController::class, 'user']);
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/friends', [FriendController::class, 'index']);
    Route::get('/friends/pending', [FriendController::class, 'pending']);
    Route::post('/friends/request', [FriendController::class, 'request']);
    Route::post('/friends/accept/{accountId}', [FriendController::class, 'accept']);
    Route::post('/friends/block/{accountId}', [FriendController::class, 'block']);
    Route::delete('/friends/{accountId}', [FriendController::class, 'destroy']);

    Route::post('/shop/purchase', [ShopController::class, 'purchase']);
    Route::get('/inventory', [InventoryController::class, 'index']);

    Route::get('/character/cosmetics', [CharacterCosmeticController::class, 'show']);
    Route::put('/character/cosmetics', [CharacterCosmeticController::class, 'update']);

    Route::middleware('admin')->prefix('admin')->group(function () {
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
