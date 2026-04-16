<?php

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

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $allowedOrigins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
