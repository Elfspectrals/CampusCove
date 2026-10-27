<?php

namespace App\Providers;

use App\Auth\AccountUserProvider;
use App\Models\Account;
use Illuminate\Foundation\Console\ServeCommand;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // `artisan serve` (Docker dev) only forwards a few env vars to its PHP workers; docker-compose sets this one.
        ServeCommand::$passthroughVariables[] = 'REALTIME_SHARED_SECRET';
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
