<?php

use App\Http\Controllers\AdminShopItemController;
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

Route::middleware('auth:sanctum')->group(function () {
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

    Route::middleware('admin')->prefix('admin/shop')->group(function () {
        Route::get('/items', [AdminShopItemController::class, 'index']);
        Route::post('/items', [AdminShopItemController::class, 'store']);
        Route::put('/items/{shop_catalog_item}', [AdminShopItemController::class, 'update']);
        Route::patch('/items/{shop_catalog_item}', [AdminShopItemController::class, 'update']);
        Route::delete('/items/{shop_catalog_item}', [AdminShopItemController::class, 'destroy']);
    });
});
