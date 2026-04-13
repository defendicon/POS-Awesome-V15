<!-- eslint-disable vue/multi-word-component-names -->
<template>
    <div class="pb-6 pr-6" style="position: absolute; bottom: 0; width: 100%">
        <v-row>
            <v-col cols="6" class="pr-1">
                <v-btn
                    block
                    size="large"
                    color="primary"
                    theme="dark"
                    @click="$emit('submit')"
                    :disabled="disabled || loading"
                    :loading="loading"
                >
                    {{ __("Submit") }}
                </v-btn>
            </v-col>
            <v-col cols="6" class="pl-1">
                <v-btn
                    block
                    size="large"
                    color="success"
                    theme="dark"
                    @click="$emit('submit-and-print')"
                    :disabled="disabled || loading"
                    :loading="loading"
                >
                    {{ __("Submit & Print") }}
                </v-btn>
            </v-col>
        </v-row>
    </div>
</template>

<script setup>
defineProps({
    loading: Boolean,
    disabled: Boolean
});

defineEmits(['submit', 'submit-and-print']);
</script>
