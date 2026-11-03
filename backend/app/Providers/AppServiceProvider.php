<?php

namespace App\Providers;

use App\Auth\AccountUserProvider;
use App\Models\Account;
use App\Services\Stripe\StripeGateway;
use App\Services\Stripe\StripeSdkGateway;
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
        // `artisan serve` (Docker dev) only forwards a few env vars to its PHP workers; docker-compose sets these.
        ServeCommand::$passthroughVariables[] = 'REALTIME_SHARED_SECRET';
        ServeCommand::$passthroughVariables[] = 'REALTIME_INTERNAL_URL';
        foreach (['FRONTEND_URL', 'GEMS_CHECKOUT_MODE', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as $var) {
            ServeCommand::$passthroughVariables[] = $var;
        }

        $this->app->singleton(StripeGateway::class, StripeSdkGateway::class);
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
