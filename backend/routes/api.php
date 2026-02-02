<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\FriendController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json(['status' => 'ok', 'app' => 'CampusCove API']);
});

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', [AuthController::class, 'user']);
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/friends', [FriendController::class, 'index']);
    Route::get('/friends/pending', [FriendController::class, 'pending']);
    Route::post('/friends/request', [FriendController::class, 'request']);
    Route::post('/friends/accept/{accountId}', [FriendController::class, 'accept']);
    Route::post('/friends/block/{accountId}', [FriendController::class, 'block']);
    Route::delete('/friends/{accountId}', [FriendController::class, 'destroy']);
});
