<template>
	<v-app class="customer-display-layout">
		<v-main class="customer-display-main">
			<slot />
		</v-main>
	</v-app>
</template>

<script setup></script>

<style scoped>
.customer-display-layout {
	height: 100dvh;
	background: radial-gradient(circle at top, #1f2937 0%, #111827 55%, #030712 100%);
}

.customer-display-main {
	height: 100%;
	display: flex;
	flex-direction: column;
	padding: 12px;
}
</style>
