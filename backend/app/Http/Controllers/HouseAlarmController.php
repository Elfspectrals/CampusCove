<?php

namespace App\Http\Controllers;

use App\Services\HouseAlarmService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HouseAlarmController extends Controller
{
    public function report(Request $request, HouseAlarmService $alarms): JsonResponse
    {
        return response()->json($alarms->takeUnseen((int) $request->user()->getAuthIdentifier()));
    }
}
