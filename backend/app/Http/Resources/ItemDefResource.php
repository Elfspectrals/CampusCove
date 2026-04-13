<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin \App\Models\ItemDef
 */
class ItemDefResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'item_def_id' => $this->item_def_id,
            'code' => $this->code,
            'name' => $this->name,
            'kind' => $this->kind,
            'rarity' => $this->rarity,
            'tradable' => $this->tradable,
            'premium_only' => $this->premium_only,
            'bind' => $this->bind,
            'max_stack' => $this->max_stack,
            'cosmetic_slot' => $this->cosmetic_slot,
            'preview_image' => $this->preview_image,
            'model_glb' => $this->model_glb,
        ];
    }
}
