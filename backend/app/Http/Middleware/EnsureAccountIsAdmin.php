<?php

namespace App\Http\Middleware;

use App\Models\Account;
use App\Models\Role;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAccountIsAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user instanceof Account) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $isAdmin = $user->roles()
            ->where('roles.name', Role::NAME_ADMIN)
            ->exists();

        if (! $isAdmin) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return $next($request);
    }
}
