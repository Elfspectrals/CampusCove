<?php

namespace App\Support;

final class AssetUrl
{
    public static function normalize(?string $path): ?string
    {
        if ($path === null) {
            return null;
        }

        $trimmed = trim($path);
        if ($trimmed === '') {
            return null;
        }

        if (str_starts_with($trimmed, '//')) {
            return $trimmed;
        }

        if (preg_match('/^https?:\/\//i', $trimmed) === 1) {
            $parsedPath = parse_url($trimmed, PHP_URL_PATH);
            if (is_string($parsedPath) && str_starts_with($parsedPath, '/storage/')) {
                $relative = ltrim(substr($parsedPath, strlen('/storage/')), '/');
                return url('/api/assets/public/'.$relative);
            }

            return $trimmed;
        }

        if (str_starts_with($trimmed, '/storage/')) {
            $relative = ltrim(substr($trimmed, strlen('/storage/')), '/');
            return url('/api/assets/public/'.$relative);
        }

        $normalized = '/'.ltrim($trimmed, '/');

        return url($normalized);
    }
}
