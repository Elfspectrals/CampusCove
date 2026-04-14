<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AssetController extends Controller
{
    public function publicDisk(string $path): StreamedResponse
    {
        $normalized = ltrim($path, '/');
        if ($normalized === '' || ! Storage::disk('public')->exists($normalized)) {
            abort(404);
        }

        return Storage::disk('public')->response($normalized);
    }
}
