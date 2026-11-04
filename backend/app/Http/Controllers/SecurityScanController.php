<?php

namespace App\Http\Controllers;

use App\Models\SecurityScan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class SecurityScanController extends Controller
{
    public const MAX_VULNERABILITIES = 5000;

    public function store(Request $request): JsonResponse
    {
        $expected = (string) config('services.security_scan.token');
        if ($expected === '' || ! hash_equals($expected, (string) $request->header('X-Scan-Token'))) {
            return response()->json([
                'message' => 'Forbidden.',
                'code' => 'scan_token_required',
            ], 403);
        }

        $validated = $request->validate([
            'commit_sha' => 'required|string|regex:/^[0-9a-f]{40}$/',
            'ref' => 'required|string|max:255',
            'vulnerabilities' => 'present|array|max:'.self::MAX_VULNERABILITIES,
            'vulnerabilities.*.target' => 'required|string',
            'vulnerabilities.*.package' => 'required|string',
            'vulnerabilities.*.installed_version' => 'required|string',
            'vulnerabilities.*.fixed_version' => 'nullable|string',
            'vulnerabilities.*.vulnerability_id' => 'required|string|max:64',
            'vulnerabilities.*.severity' => ['required', Rule::in(SecurityScan::SEVERITIES)],
            'vulnerabilities.*.title' => 'nullable|string',
        ]);

        $scan = DB::transaction(function () use ($validated) {
            SecurityScan::query()->delete();
            $scan = SecurityScan::create([
                'commit_sha' => $validated['commit_sha'],
                'ref' => $validated['ref'],
                'scanned_at' => now(),
            ]);
            $scan->vulnerabilities()->createMany(array_map(fn (array $vulnerability) => [
                'target' => $vulnerability['target'],
                'package' => $vulnerability['package'],
                'installed_version' => $vulnerability['installed_version'],
                'fixed_version' => $vulnerability['fixed_version'] ?? null,
                'vulnerability_id' => $vulnerability['vulnerability_id'],
                'severity' => $vulnerability['severity'],
                'title' => $vulnerability['title'] ?? null,
            ], $validated['vulnerabilities']));

            return $scan;
        });

        return response()->json([
            'scan_id' => $scan->id,
            'vulnerabilities' => count($validated['vulnerabilities']),
        ], 201);
    }
}
