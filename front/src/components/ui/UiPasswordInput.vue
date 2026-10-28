<script setup lang="ts">
/** Password field with a Show / Hide toggle (replaces a "confirm password" field). Attributes go to the <input>. */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({ inheritAttrs: false })
const model = defineModel<string>({ required: true })
const { t } = useI18n()
const visible = ref(false)
</script>

<template>
  <div class="relative">
    <input v-model="model" v-bind="$attrs" :type="visible ? 'text' : 'password'" spellcheck="false" autocapitalize="off" class="cc-input pr-24" />
    <button
      type="button"
      class="absolute inset-y-1.5 right-1.5 rounded-lg px-3 text-xs font-extrabold text-pool transition-colors hover:bg-ink-800"
      :aria-label="visible ? t('auth.hidePassword') : t('auth.showPassword')"
      :aria-pressed="visible"
      @click="visible = !visible"
    >
      {{ visible ? t('auth.hide') : t('auth.show') }}
    </button>
  </div>
</template>
