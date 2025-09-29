/**
 * Pinia Store Setup for POSAwesome
 */

import { createPinia } from 'pinia';

// Create and export pinia instance
export const pinia = createPinia();

// Export stores
export { useItemsStore } from './itemsStore.js';
export { useUpdateStore, formatBuildVersion } from './updateStore.js';

export default pinia;
