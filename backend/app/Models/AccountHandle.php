<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccountHandle extends Model
{
    protected $table = 'account_handles';

    protected $primaryKey = 'account_id';

    public $incrementing = false;

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    protected $fillable = ['account_id', 'username', 'tag', 'normalized'];

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'account_id', 'account_id');
    }

    /**
     * Usernames are free text (any language, spaces, emoji), at least 3 characters, unique case-insensitively.
     * Only invisible / control characters are refused (\p{C}): they would allow look-alike or blank names.
     * 255 is a safety net against abuse, not a product limit.
     *
     * @return list<string>
     */
    public static function usernameRules(): array
    {
        return ['string', 'min:3', 'max:255', 'regex:/^[^\p{C}]+$/u'];
    }

    /** Trims and collapses inner whitespace, so "  Léa   M " and "Léa M" are the same name. */
    public static function cleanUsername(mixed $value): mixed
    {
        return is_string($value) ? (preg_replace('/\s+/u', ' ', trim($value)) ?? $value) : $value;
    }

    /** Display name: username#tag (e.g. John#0420) */
    public function getDisplayNameAttribute(): string
    {
        return $this->username . '#' . str_pad((string) $this->tag, 4, '0', STR_PAD_LEFT);
    }
}
