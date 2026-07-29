<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Auth;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        if (file_exists('/.dockerenv') && ! getenv('DB_HOST')) {
            putenv('DB_HOST=postgres');
            $_ENV['DB_HOST'] = 'postgres';
            $_SERVER['DB_HOST'] = 'postgres';
        }

        parent::setUp();
    }

    /**
     * Feature tests can issue requests as several Bearer-token users in one
     * process. Forget the previous synthetic request's resolved guard so
     * Sanctum authenticates every request from its own header.
     */
    public function call(
        $method,
        $uri,
        $parameters = [],
        $cookies = [],
        $files = [],
        $server = [],
        $content = null
    ) {
        Auth::forgetGuards();

        return parent::call($method, $uri, $parameters, $cookies, $files, $server, $content);
    }
}
