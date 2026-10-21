<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiRejectedException;
use App\Models\Account;
use App\Services\ApartmentPlacementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * House decoration, called by the realtime server on behalf of a player. Rejections
 * (ApartmentPlacementException) render themselves as `{ message, code }`.
 */
class ApartmentPlacementController extends Controller
{
    private const OBJECT_TRANSFORM_RULES = [
        'variant' => ['nullable', 'string', 'max:160'],
        'color' => ['nullable', 'string', 'max:20'],
        'x' => ['required', 'numeric'],
        'y' => ['required', 'numeric'],
        'z' => ['required', 'numeric'],
        'rotX' => ['required', 'numeric'],
        'rotY' => ['required', 'numeric'],
        'rotZ' => ['required', 'numeric'],
    ];

    private const HOUSE_RULES = [
        'owner_account_id' => ['nullable', 'integer', 'min:1'],
        'template_key' => ['nullable', 'string', 'max:120'],
    ];

    public function __construct(
        private readonly ApartmentPlacementService $placements,
    ) {
    }

    public function inventory(Request $request): JsonResponse
    {
        $accountId = $this->actorId($request);

        try {
            $items = $this->placements->listSpawnableAssets($accountId);
        } catch (ApiRejectedException $e) {
            return $e->render();
        } catch (Throwable $e) {
            Log::error('apartments.assets failed', ['account_id' => $accountId, 'error' => $e->getMessage()]);

            return response()->json([
                'message' => 'Could not load apartment assets.',
                'code' => 'apartment_assets_error',
            ], 500);
        }

        return response()->json(['items' => $items->values()->all()]);
    }

    public function state(Request $request): JsonResponse
    {
        $validated = $request->validate(self::HOUSE_RULES);
        [$actorAccountId, $ownerAccountId] = $this->actorAndOwner($request, $validated);

        try {
            $state = $this->placements->resolveApartmentState(
                $actorAccountId,
                $ownerAccountId,
                $validated['template_key'] ?? null
            );
        } catch (ApiRejectedException $e) {
            return $e->render();
        } catch (Throwable $e) {
            Log::error('apartments.state failed', [
                'actor_account_id' => $actorAccountId,
                'owner_account_id' => $ownerAccountId,
                'template_key' => $validated['template_key'] ?? null,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Could not load apartment state.',
                'code' => 'apartment_state_error',
            ], 500);
        }

        return response()->json(['apartment' => $state]);
    }

    public function spawn(Request $request): JsonResponse
    {
        $validated = $request->validate(self::HOUSE_RULES + [
            'objectId' => ['required', 'string', 'max:160'],
            'objectKey' => ['required', 'string', 'max:160'],
        ] + self::OBJECT_TRANSFORM_RULES);
        [$actorAccountId, $ownerAccountId] = $this->actorAndOwner($request, $validated);

        $object = $this->placements->spawnObject(
            $actorAccountId,
            $ownerAccountId,
            $validated['template_key'] ?? null,
            $validated
        );

        return response()->json(['object' => $object]);
    }

    public function transform(Request $request): JsonResponse
    {
        $validated = $request->validate(self::HOUSE_RULES + [
            'objectId' => ['required', 'string', 'max:160'],
        ] + self::OBJECT_TRANSFORM_RULES);
        [$actorAccountId, $ownerAccountId] = $this->actorAndOwner($request, $validated);

        $object = $this->placements->transformObject(
            $actorAccountId,
            $ownerAccountId,
            $validated['template_key'] ?? null,
            $validated
        );

        return response()->json(['object' => $object]);
    }

    public function pickup(Request $request): JsonResponse
    {
        $validated = $request->validate(self::HOUSE_RULES + [
            'objectId' => ['required', 'string', 'max:160'],
        ]);
        [$actorAccountId, $ownerAccountId] = $this->actorAndOwner($request, $validated);

        return response()->json($this->placements->pickupObject(
            $actorAccountId,
            $ownerAccountId,
            $validated['template_key'] ?? null,
            (string) $validated['objectId']
        ));
    }

    private function actorId(Request $request): int
    {
        /** @var Account $account */
        $account = $request->user();

        return (int) $account->getAuthIdentifier();
    }

    /**
     * The player making the request and the owner of the house they act in (themselves by default).
     *
     * @return array{0: int, 1: int}
     */
    private function actorAndOwner(Request $request, array $validated): array
    {
        $actorAccountId = $this->actorId($request);

        return [$actorAccountId, (int) ($validated['owner_account_id'] ?? $actorAccountId)];
    }
}
