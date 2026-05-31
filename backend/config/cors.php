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

// Regex patterns (comma-separated) to allow dynamic origins like Vercel preview URLs.
$envAllowedOriginPatterns = env('CORS_ALLOWED_ORIGIN_PATTERNS');
$allowedOriginPatterns = is_string($envAllowedOriginPatterns) && $envAllowedOriginPatterns !== ''
    ? array_values(array_filter(array_map('trim', explode(',', $envAllowedOriginPatterns))))
    : [];

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $allowedOrigins,

    'allowed_origins_patterns' => $allowedOriginPatterns,

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
