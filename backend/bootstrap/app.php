<?php

use Illuminate\Console\Scheduling\Schedule;
use App\Http\Middleware\EnsureAccountIsActive;
use App\Http\Middleware\EnsureAccountIsAdmin;
use App\Http\Middleware\EnsureRealtimeServer;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\HandleCors;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

$defaultAllowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
];

$envAllowedOrigins = env('CORS_ALLOWED_ORIGINS');
$allowedOrigins = is_string($envAllowedOrigins) && $envAllowedOrigins !== ''
    ? array_values(array_filter(array_map('trim', explode(',', $envAllowedOrigins))))
    : $defaultAllowedOrigins;

return Application::configure(basePath: dirname(__DIR__))
    ->withSchedule(function (Schedule $schedule): void {
        $schedule->command('housing:collect-taxes')->everyMinute();
    })
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Empty inventory slots are sent as "" — keep them as strings for layout validation.
        $middleware->convertEmptyStringsToNull(except: [
            fn (Request $request) => $request->is('api/inventory/layout'),
        ]);
        $middleware->api(prepend: [
            HandleCors::class,
        ]);
        $middleware->alias([
            'admin' => EnsureAccountIsAdmin::class,
            'account.active' => EnsureAccountIsActive::class,
            'realtime' => EnsureRealtimeServer::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) use ($allowedOrigins): void {
        $exceptions->respond(function (Response $response) use ($allowedOrigins): Response {
            if (request()->is('api/*') && request()->header('Origin')) {
                $origin = request()->header('Origin');
                if (in_array($origin, $allowedOrigins, true)) {
                    $response->headers->set('Access-Control-Allow-Origin', $origin);
                    $response->headers->set('Access-Control-Allow-Credentials', 'true');
                    $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
                    $response->headers->set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
                }
            }

            return $response;
        });
    })->create();
