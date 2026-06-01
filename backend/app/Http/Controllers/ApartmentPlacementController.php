<?php

namespace App\Http\Controllers;

use App\Exceptions\ApartmentPlacementException;
use App\Models\Account;
use App\Services\ApartmentPlacementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

class ApartmentPlacementController extends Controller
{
    public function __construct(
        private readonly ApartmentPlacementService $placements,
    ) {
    }

    public function inventory(Request $request): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();
        $accountId = (int) $account->getAuthIdentifier();

        try {
            $items = $this->placements->listSpawnableAssets($accountId);
        } catch (ApartmentPlacementException $e) {
            return $this->placementError($e);
        } catch (Throwable $e) {
            Log::error('apartments.assets failed', [
                'account_id' => $accountId,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Could not load apartment assets.',
                'code' => 'apartment_assets_error',
            ], 500);
        }

        return response()->json([
            'items' => $items->values()->all(),
        ]);
    }

    public function state(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'owner_account_id' => ['nullable', 'integer', 'min:1'],
            'template_key' => ['nullable', 'string', 'max:120'],
        ]);
        /** @var Account $account */
        $account = $request->user();
        $actorAccountId = (int) $account->getAuthIdentifier();
        $ownerAccountId = (int) ($validated['owner_account_id'] ?? $actorAccountId);

        try {
            $state = $this->placements->resolveApartmentState(
                $actorAccountId,
                $ownerAccountId,
                $validated['template_key'] ?? null
            );
        } catch (ApartmentPlacementException $e) {
            return $this->placementError($e);
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

        return response()->json([
            'apartment' => $state,
        ]);
    }

    public function spawn(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'owner_account_id' => ['nullable', 'integer', 'min:1'],
            'template_key' => ['nullable', 'string', 'max:120'],
            'objectId' => ['required', 'string', 'max:160'],
            'objectKey' => ['required', 'string', 'max:160'],
            'variant' => ['nullable', 'string', 'max:160'],
            'color' => ['nullable', 'string', 'max:20'],
            'x' => ['required', 'numeric'],
            'y' => ['required', 'numeric'],
            'z' => ['required', 'numeric'],
            'rotX' => ['required', 'numeric'],
            'rotY' => ['required', 'numeric'],
            'rotZ' => ['required', 'numeric'],
        ]);
        /** @var Account $account */
        $account = $request->user();
        $actorAccountId = (int) $account->getAuthIdentifier();
        $ownerAccountId = (int) ($validated['owner_account_id'] ?? $actorAccountId);

        try {
            $object = $this->placements->spawnObject(
                $actorAccountId,
                $ownerAccountId,
                $validated['template_key'] ?? null,
                $validated
            );
        } catch (ApartmentPlacementException $e) {
            return $this->placementError($e);
        }

        return response()->json([
            'object' => $object,
        ]);
    }

    public function transform(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'owner_account_id' => ['nullable', 'integer', 'min:1'],
            'template_key' => ['nullable', 'string', 'max:120'],
            'objectId' => ['required', 'string', 'max:160'],
            'variant' => ['nullable', 'string', 'max:160'],
            'color' => ['nullable', 'string', 'max:20'],
            'x' => ['required', 'numeric'],
            'y' => ['required', 'numeric'],
            'z' => ['required', 'numeric'],
            'rotX' => ['required', 'numeric'],
            'rotY' => ['required', 'numeric'],
            'rotZ' => ['required', 'numeric'],
        ]);
        /** @var Account $account */
        $account = $request->user();
        $actorAccountId = (int) $account->getAuthIdentifier();
        $ownerAccountId = (int) ($validated['owner_account_id'] ?? $actorAccountId);

        try {
            $object = $this->placements->transformObject(
                $actorAccountId,
                $ownerAccountId,
                $validated['template_key'] ?? null,
                $validated
            );
        } catch (ApartmentPlacementException $e) {
            return $this->placementError($e);
        }

        return response()->json([
            'object' => $object,
        ]);
    }

    public function pickup(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'owner_account_id' => ['nullable', 'integer', 'min:1'],
            'template_key' => ['nullable', 'string', 'max:120'],
            'objectId' => ['required', 'string', 'max:160'],
        ]);
        /** @var Account $account */
        $account = $request->user();
        $actorAccountId = (int) $account->getAuthIdentifier();
        $ownerAccountId = (int) ($validated['owner_account_id'] ?? $actorAccountId);

        try {
            $result = $this->placements->pickupObject(
                $actorAccountId,
                $ownerAccountId,
                $validated['template_key'] ?? null,
                (string) $validated['objectId']
            );
        } catch (ApartmentPlacementException $e) {
            return $this->placementError($e);
        }

        return response()->json($result);
    }

    private function placementError(ApartmentPlacementException $exception): JsonResponse
    {
        return response()->json([
            'message' => $exception->getMessage(),
            'code' => $exception->errorCode,
        ], $exception->status);
    }
}

