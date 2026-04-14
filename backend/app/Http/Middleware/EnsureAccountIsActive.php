<?php

namespace App\Http\Middleware;

use App\Models\Account;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAccountIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user instanceof Account) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ($user->banned_at !== null) {
            $user->tokens()->delete();

            return response()->json([
                'message' => 'Account is banned.',
                'code' => 'account_banned',
            ], 403);
        }

        if ($user->suspended_until !== null && $user->suspended_until->isFuture()) {
            $user->tokens()->delete();

            return response()->json([
                'message' => 'Account is suspended.',
                'code' => 'account_suspended',
                'suspended_until' => $user->suspended_until->toIso8601String(),
            ], 403);
        }

        return $next($request);
    }
}
