<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        if (file_exists('/.dockerenv')) {
            putenv('DB_HOST=postgres');
            $_ENV['DB_HOST'] = 'postgres';
            $_SERVER['DB_HOST'] = 'postgres';
            putenv('DB_DATABASE=campus_cove_test');
            $_ENV['DB_DATABASE'] = 'campus_cove_test';
            $_SERVER['DB_DATABASE'] = 'campus_cove_test';
        }

        parent::setUp();
    }
}
