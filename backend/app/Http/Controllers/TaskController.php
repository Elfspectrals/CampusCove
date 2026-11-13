<?php

namespace App\Http\Controllers;

use App\Services\TaskProgressService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    public function __construct(private readonly TaskProgressService $tasks) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['tasks' => $this->tasks->overview((int) $request->user()->getAuthIdentifier())]);
    }
}
