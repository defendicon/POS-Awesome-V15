<template>
	<div class="notification-bell-btn">
		<v-menu v-model="open" :close-on-content-click="false" offset="[0, 8]" location="bottom end">
			<template #activator="{ props }">
				<v-btn
					v-bind="props"
					icon
					variant="elevated"
					size="small"
					class="pos-themed-button notification-bell-trigger pos-touch-target pos-focus-ring"
					:aria-label="__('View notifications') + (unreadCount ? ` (${unreadCount})` : '')"
				>
					<v-badge
						:model-value="unreadCount > 0"
						:content="unreadCount"
						color="error"
						floating
						v-if="notifications.length"
					>
						<v-icon class="pos-text-primary">mdi-bell-outline</v-icon>
					</v-badge>
					<v-icon v-else class="pos-text-primary">mdi-bell-outline</v-icon>
				</v-btn>
			</template>

			<v-card class="pos-themed-card notification-card" elevation="12">
				<div class="notification-card__header">
					<div class="header-text">
						<div class="notification-heading">{{ __("Notifications") }}</div>
						<div class="subtitle">
							{{
								notifications.length
									? __("Recent updates about your invoices")
									: __("Everything is quiet right now")
							}}
						</div>
					</div>
					<v-btn
						v-if="notifications.length"
						variant="text"
						size="small"
						class="clear-btn"
						@click="clearAll"
					>
						<v-icon start size="16">mdi-broom</v-icon>
						{{ __("Clear All") }}
					</v-btn>
				</div>

				<v-divider></v-divider>

				<div class="notification-list">
					<div v-if="!notifications.length" class="empty-state">
						<div class="empty-pill">
							<v-icon size="16">mdi-check-circle-outline</v-icon>
							<span>{{ __("All caught up") }}</span>
						</div>
						<v-icon size="40" class="empty-icon">mdi-bell-off-outline</v-icon>
						<div class="empty-title">{{ __("No notifications yet") }}</div>
						<div class="empty-subtitle">
							{{ __("Invoice failures and retry issues will appear here when they need your attention.") }}
						</div>
					</div>
					<v-list v-else density="compact" class="notification-items">
						<v-list-item v-for="item in notifications" :key="item.id" class="notification-item">
							<template #prepend>
								<div class="notification-icon" :class="item.color || 'error'">
									<v-icon size="18">mdi-bell-alert-outline</v-icon>
								</div>
							</template>
							<div class="notification-content">
								<div class="notification-title">{{ item.title }}</div>
								<div v-if="item.detail" class="notification-detail">
									{{ item.detail }}
								</div>
								<div class="notification-time">{{ formatTimestamp(item.timestamp) }}</div>
							</div>
						</v-list-item>
					</v-list>
				</div>
			</v-card>
		</v-menu>
	</div>
</template>

<script setup lang="ts">
import { ref, toRefs, watch } from "vue";

defineOptions({
	name: "NotificationBell",
});

interface NotificationItem {
	id: string | number;
	title: string;
	detail?: string;
	timestamp: string | number | Date;
	color?: string;
}

interface Props {
	notifications?: NotificationItem[];
	unreadCount?: number;
}

const props = withDefaults(defineProps<Props>(), {
	notifications: () => [],
	unreadCount: 0,
});
const { notifications, unreadCount } = toRefs(props);

const emit = defineEmits<{
	(_event: "mark-read"): void;
	(_event: "clear"): void;
}>();

// @ts-ignore
const __ = (window as any).__ || ((text: string) => text);
const open = ref(false);

watch(open, (value) => {
	if (value) {
		emit("mark-read");
	}
});

function clearAll() {
	emit("clear");
}

function formatTimestamp(ts: string | number | Date) {
	if (!ts) {
		return "";
	}
	try {
		const date = new Date(ts);
		return date.toLocaleString();
	} catch {
		return String(ts);
	}
}
</script>

<style scoped>
.notification-bell-btn {
	display: flex;
	align-items: center;
}

.notification-bell-trigger {
	min-width: var(--pos-touch-target-min) !important;
	min-height: var(--pos-touch-target-min) !important;
	box-shadow: 0 4px 12px var(--pos-shadow, rgba(0, 0, 0, 0.18)) !important;
}

.notification-card {
	width: min(400px, calc(100vw - 32px));
	min-width: min(320px, calc(100vw - 32px));
	max-width: min(400px, calc(100vw - 32px));
}

.notification-card__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px 16px;
}

.header-text .notification-heading {
	font-weight: 700;
	font-size: 1rem;
}

.header-text .subtitle {
	font-size: 0.85rem;
	color: var(--pos-text-secondary);
}

.clear-btn {
	text-transform: none;
	font-weight: 600;
}

.notification-list {
	max-height: 360px;
	overflow-y: auto;
}

.notification-items {
	padding: 0;
}

.notification-item {
	border-bottom: 1px solid var(--pos-border);
}

.notification-item:last-child {
	border-bottom: none;
}

.notification-icon {
	width: 36px;
	height: 36px;
	border-radius: 12px;
	display: flex;
	align-items: center;
	justify-content: center;
	color: white;
}

.notification-icon.error {
	background: linear-gradient(135deg, #e53935, #e57373);
}

.notification-content {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.notification-title {
	font-weight: 700;
	color: var(--pos-text-primary);
}

.notification-detail {
	font-size: 0.9rem;
	color: var(--pos-text-secondary);
	white-space: pre-wrap;
}

.notification-time {
	font-size: 0.75rem;
	color: var(--pos-text-secondary);
}

.empty-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 28px 16px;
	text-align: center;
	color: var(--pos-text-secondary);
	background:
		radial-gradient(circle at top, rgba(var(--v-theme-primary), 0.08), transparent 58%),
		linear-gradient(180deg, rgba(var(--v-theme-surface), 0.88), rgba(var(--v-theme-surface), 0.72));
}

.empty-icon {
	color: var(--pos-text-secondary);
	margin-bottom: 10px;
}

.empty-pill {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 6px 10px;
	margin-bottom: 10px;
	border-radius: 999px;
	background: rgba(var(--v-theme-success), 0.12);
	color: rgb(var(--v-theme-success));
	font-size: 0.78rem;
	font-weight: 700;
}

.empty-title {
	font-weight: 700;
	color: var(--pos-text-primary);
	margin-bottom: 4px;
}

.empty-subtitle {
	font-size: 0.9rem;
}
</style>
