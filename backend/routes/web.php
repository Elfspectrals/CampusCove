<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Uses config('app.spa_public_url') (SPA_PUBLIC_URL, else APP_URL) as the crawlable SPA origin.
// If robots/sitemap are only served from the static front host, mirror the same URLs there.
Route::get('/robots.txt', function () {
    $base = rtrim(config('app.spa_public_url'), '/');
    $body = implode("\n", [
        'User-agent: *',
        'Disallow: /api/',
        '',
        'Sitemap: '.$base.'/sitemap.xml',
        '',
    ]);

    return response($body, 200, ['Content-Type' => 'text/plain; charset=UTF-8']);
});

Route::get('/sitemap.xml', function () {
    $base = rtrim(config('app.spa_public_url'), '/');
    // Indexable marketing/app routes only (auth flows are noindex in the SPA).
    $paths = [
        ['path' => '/', 'priority' => '1.0', 'changefreq' => 'weekly'],
        ['path' => '/item-shop', 'priority' => '0.8', 'changefreq' => 'weekly'],
    ];
    $urls = '';
    foreach ($paths as $row) {
        $u = htmlspecialchars($base.$row['path'], ENT_XML1 | ENT_QUOTES, 'UTF-8');
        $p = htmlspecialchars($row['priority'], ENT_XML1 | ENT_QUOTES, 'UTF-8');
        $c = htmlspecialchars($row['changefreq'], ENT_XML1 | ENT_QUOTES, 'UTF-8');
        $urls .= '  <url><loc>'.$u.'</loc><changefreq>'.$c.'</changefreq><priority>'.$p.'</priority></url>'."\n";
    }
    $xml = '<?xml version="1.0" encoding="UTF-8"?>'."\n"
        .'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'."\n"
        .$urls."\n"
        .'</urlset>'."\n";

    return response($xml, 200, ['Content-Type' => 'application/xml; charset=UTF-8']);
});
