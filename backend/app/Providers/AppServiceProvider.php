<?php

namespace App\Providers;

use App\Auth\AccountUserProvider;
use App\Models\Account;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Auth::provider('account', function ($app, array $config) {
            return new AccountUserProvider($app['hash'], $config['model'] ?? Account::class);
        });
    }
}
