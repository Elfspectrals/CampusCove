<?php

namespace App\Services;

use App\Models\IpBan;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CloudflareBanSync
{
    public const API_URL = 'https://api.cloudflare.com/client/v4';

    public function sync(string $ip): void
    {
        if (! $this->isEnabled()) {
            return;
        }

        $this->removeLiftedRules(IpBan::where('ip', $ip));
        $this->addMissingRules(IpBan::where('ip', $ip));
    }

    public function syncAll(): void
    {
        if (! $this->isEnabled()) {
            return;
        }

        $this->removeLiftedRules(IpBan::query());
        $this->addMissingRules(IpBan::query());
    }

    private function removeLiftedRules(Builder $bans): void
    {
        $lifted = $bans->clone()->whereNotNull('cloudflare_rule_id')->get()->reject(fn (IpBan $ban) => $ban->isActive());
        foreach ($lifted as $ban) {
            try {
                $response = $this->api()->delete($this->rulesUrl().'/'.$ban->cloudflare_rule_id);
                $alreadyGone = $response->status() === 404;
                if (! $alreadyGone) {
                    $response->throw();
                }
            } catch (RequestException|ConnectionException $e) {
                Log::warning("cloudflare unblock failed for {$ban->ip}: ".$e->getMessage());

                continue;
            }
            $ban->update(['cloudflare_rule_id' => null]);
        }
    }

    private function addMissingRules(Builder $bans): void
    {
        $missing = $bans->clone()->active()->whereNull('cloudflare_rule_id')->get()->filter(fn (IpBan $ban) => $this->isPublicIp($ban->ip));
        foreach ($missing as $ban) {
            try {
                $ruleId = $this->api()->post($this->rulesUrl(), [
                    'mode' => 'block',
                    'configuration' => [
                        'target' => filter_var($ban->ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) === false ? 'ip' : 'ip6',
                        'value' => $ban->ip,
                    ],
                    'notes' => "CampusCove {$ban->reason} ban #{$ban->id}",
                ])->throw()->json('result.id');
            } catch (RequestException|ConnectionException $e) {
                Log::warning("cloudflare block failed for {$ban->ip}: ".$e->getMessage());

                continue;
            }
            $ban->update(['cloudflare_rule_id' => $ruleId]);
        }
    }

    private function isEnabled(): bool
    {
        return (string) config('services.cloudflare.api_token') !== '' && (string) config('services.cloudflare.zone_id') !== '';
    }

    private function isPublicIp(string $ip): bool
    {
        return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
    }

    private function rulesUrl(): string
    {
        return self::API_URL.'/zones/'.config('services.cloudflare.zone_id').'/firewall/access_rules/rules';
    }

    private function api(): PendingRequest
    {
        return Http::withToken((string) config('services.cloudflare.api_token'))
            ->acceptJson()
            ->timeout(5);
    }
}
