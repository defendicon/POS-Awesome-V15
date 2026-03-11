<template>
	<v-app class="customer-display-layout posapp pos-theme-root">
		<v-main class="customer-display-main">
			<slot />
		</v-main>
	</v-app>
</template>

<script setup></script>

<style scoped>
.customer-display-layout {
	height: 100dvh;
	background:
		radial-gradient(circle at top, color-mix(in srgb, var(--pos-primary) 22%, transparent) 0%, transparent 42%),
		linear-gradient(180deg, var(--pos-bg-secondary) 0%, var(--pos-bg-primary) 100%);
	color: var(--pos-text-primary);
}

.customer-display-main {
	height: 100%;
	display: flex;
	flex-direction: column;
	padding: 12px;
}
</style>
