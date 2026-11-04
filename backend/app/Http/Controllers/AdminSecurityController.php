<?php

namespace App\Http\Controllers;

use App\Services\IpBanService;
use App\Services\SecurityDashboardService;
use App\Support\ClientOrigin;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminSecurityController extends Controller
{
    public function __construct(
        private readonly SecurityDashboardService $dashboard,
        private readonly IpBanService $bans,
    ) {}

    public function overview(): JsonResponse
    {
        return response()->json($this->dashboard->overview());
    }

    public function events(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ip' => 'nullable|ip',
            'type' => ['nullable', Rule::in(array_keys(IpBanService::WEIGHTS))],
            'before_id' => 'nullable|integer|min:1',
        ]);

        return response()->json($this->dashboard->events(
            $validated['ip'] ?? null,
            $validated['type'] ?? null,
            isset($validated['before_id']) ? (int) $validated['before_id'] : null,
        ));
    }

    public function showIp(string $ip): JsonResponse
    {
        return response()->json($this->dashboard->ip($this->validIp($ip)));
    }

    public function cves(): JsonResponse
    {
        return response()->json($this->dashboard->cves());
    }

    public function bans(): JsonResponse
    {
        return response()->json(['bans' => $this->dashboard->activeBans()]);
    }

    public function ban(Request $request, string $ip): JsonResponse
    {
        $ip = $this->validIp($ip);
        $validated = $request->validate([
            'duration' => 'required|in:24h,permanent',
            'report' => 'required|boolean',
        ]);

        if (ClientOrigin::fromRequest($request)->ip === $ip) {
            return response()->json([
                'message' => 'You cannot ban your own IP.',
                'code' => 'own_ip',
            ], 422);
        }

        $ban = $this->bans->banManually(
            $ip,
            $validated['duration'] === 'permanent',
            (int) $request->user()->account_id,
            (bool) $validated['report'],
        );

        return response()->json(['ban' => $this->dashboard->banPayload($ban)], 201);
    }

    public function unban(Request $request, string $ip): JsonResponse
    {
        $ip = $this->validIp($ip);
        if ($this->bans->unban($ip, (int) $request->user()->account_id) === 0) {
            return response()->json([
                'message' => 'This IP is not banned.',
                'code' => 'not_banned',
            ], 404);
        }

        return response()->json(['ip' => $this->dashboard->ip($ip)]);
    }

    private function validIp(string $ip): string
    {
        if (filter_var($ip, FILTER_VALIDATE_IP) === false) {
            throw ValidationException::withMessages(['ip' => ['The ip must be a valid IP address.']]);
        }

        return $ip;
    }
}
