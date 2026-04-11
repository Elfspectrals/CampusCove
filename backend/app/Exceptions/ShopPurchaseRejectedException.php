<?php

namespace App\Exceptions;

use Exception;

final class ShopPurchaseRejectedException extends Exception
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $httpStatus = 422,
    ) {
        parent::__construct($message);
    }
}
