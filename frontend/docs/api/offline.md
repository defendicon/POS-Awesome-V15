[**posawesome-frontend**](README.md)

***

[posawesome-frontend](README.md) / offline

# offline

Public barrel for the POS offline layer.

Import all offline functionality from this module rather than from individual
sub-modules. The layer is composed of four levels:

- **`db`** — storage primitives: the Dexie IndexedDB instance (`db`), the
  in-memory store (`memory`), `persist()`, network-status helpers, and
  cache-clear utilities. Every other sub-module in this layer depends on these.

- **Domain queues** (`invoices`, `customers`, `payments`, `cash_movements`,
  `stock`) — per-domain read/write helpers for data queued while the device is
  offline and replayed to the server when connectivity is restored.

- **`cache`** — named key-value accessors for reference data fetched from the
  server (offers, price lists, exchange rates, item details, etc.). Every write
  goes through `memory` and calls `persist()`.

- **`sync/*`** — background sync engine composed of `types`, `resourceRegistry`,
  `syncState`, `SyncCoordinator`, `useSyncCoordinator`, and per-resource
  `adapters`.

`memoryInitPromise` is a backward-compatible alias for `initPromise` (from `db`).
Await it before reading any `memory` value at application startup.

## Functions

### buildSyncStateStorageKey()

> **buildSyncStateStorageKey**(`resourceId`): `string`

Defined in: [offline/sync/syncState.ts:11](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/syncState.ts#L11)

#### Parameters

##### resourceId

[`SyncResourceId`](#syncresourceid)

#### Returns

`string`

***

### checkDbHealth()

> **checkDbHealth**(): `Promise`\<`boolean`\>

Defined in: [offline/db.ts:807](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L807)

#### Returns

`Promise`\<`boolean`\>

***

### claimRetryableQueueEntries()

> **claimRetryableQueueEntries**(`entityType`): `Promise`\<[`OfflineQueueEntry`](#offlinequeueentry)[]\>

Defined in: [offline/writeQueue.ts:429](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L429)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

#### Returns

`Promise`\<[`OfflineQueueEntry`](#offlinequeueentry)[]\>

***

### clearAllCache()

> **clearAllCache**(): `Promise`\<`void`\>

Defined in: [offline/db.ts:665](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L665)

#### Returns

`Promise`\<`void`\>

***

### clearCoupons()

> **clearCoupons**(): `void`

Defined in: [offline/cache.ts:1271](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1271)

#### Returns

`void`

***

### clearCustomerBalanceCache()

> **clearCustomerBalanceCache**(): `void`

Defined in: [offline/customers.ts:356](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L356)

#### Returns

`void`

***

### clearCustomerStorage()

> **clearCustomerStorage**(): `Promise`\<`void`\>

Defined in: [offline/cache.ts:1122](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1122)

#### Returns

`Promise`\<`void`\>

***

### clearDerivedOfflineCaches()

> **clearDerivedOfflineCaches**(): `Promise`\<`void`\>

Defined in: [offline/db.ts:731](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L731)

#### Returns

`Promise`\<`void`\>

***

### clearExpiredCustomerBalances()

> **clearExpiredCustomerBalances**(): `void`

Defined in: [offline/customers.ts:365](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L365)

#### Returns

`void`

***

### clearGiftCardSnapshotCache()

> **clearGiftCardSnapshotCache**(): `void`

Defined in: [offline/customers.ts:317](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L317)

#### Returns

`void`

***

### clearItemDetailsCache()

> **clearItemDetailsCache**(): `void`

Defined in: [offline/cache.ts:767](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L767)

#### Returns

`void`

***

### clearItemGroups()

> **clearItemGroups**(): `void`

Defined in: [offline/cache.ts:1296](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1296)

#### Returns

`void`

***

### clearLocalStockCache()

> **clearLocalStockCache**(): `void`

Defined in: [offline/stock.ts:181](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/stock.ts#L181)

#### Returns

`void`

***

### clearOfflineCashMovements()

> **clearOfflineCashMovements**(): `Promise`\<`void`\>

Defined in: [offline/cash\_movements.ts:39](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cash_movements.ts#L39)

#### Returns

`Promise`\<`void`\>

***

### clearOfflineCustomers()

> **clearOfflineCustomers**(): `Promise`\<`void`\>

Defined in: [offline/customers.ts:58](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L58)

#### Returns

`Promise`\<`void`\>

***

### clearOfflineInvoices()

> **clearOfflineInvoices**(): `Promise`\<`void`\>

Defined in: [offline/invoices.ts:238](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoices.ts#L238)

#### Returns

`Promise`\<`void`\>

***

### clearOfflinePayments()

> **clearOfflinePayments**(): `Promise`\<`void`\>

Defined in: [offline/payments.ts:55](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/payments.ts#L55)

#### Returns

`Promise`\<`void`\>

***

### clearOpeningStorage()

> **clearOpeningStorage**(): `void`

Defined in: [offline/cache.ts:1009](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1009)

#### Returns

`void`

***

### clearPriceListCache()

> **clearPriceListCache**(): `void`

Defined in: [offline/cache.ts:578](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L578)

#### Returns

`void`

***

### clearPricingRulesSnapshot()

> **clearPricingRulesSnapshot**(): `void`

Defined in: [offline/cache.ts:1177](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1177)

#### Returns

`void`

***

### clearStoredItems()

> **clearStoredItems**(`scope?`): `Promise`\<`void`\>

Defined in: [offline/cache.ts:441](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L441)

#### Parameters

##### scope?

`string` = `""`

#### Returns

`Promise`\<`void`\>

***

### clearStoredValueSnapshotCache()

> **clearStoredValueSnapshotCache**(): `void`

Defined in: [offline/customers.ts:273](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L273)

#### Returns

`void`

***

### clearSyncResourceState()

> **clearSyncResourceState**(`resourceId`): `Promise`\<`void`\>

Defined in: [offline/sync/syncState.ts:96](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/syncState.ts#L96)

#### Parameters

##### resourceId

[`SyncResourceId`](#syncresourceid)

#### Returns

`Promise`\<`void`\>

***

### clearWriteQueueEntries()

> **clearWriteQueueEntries**(`entityType`, `options?`): `Promise`\<`void`\>

Defined in: [offline/writeQueue.ts:410](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L410)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

##### options?

###### includeSynced?

`boolean`

#### Returns

`Promise`\<`void`\>

***

### createDefaultSyncCoordinator()

> **createDefaultSyncCoordinator**(): [`SyncCoordinator`](#synccoordinator)

Defined in: [offline/sync/SyncCoordinator.ts:467](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/SyncCoordinator.ts#L467)

Creates a [SyncCoordinator](#synccoordinator) pre-loaded with the full default resource registry.
This is the standard factory used by `useSyncCoordinator` at app startup.

#### Returns

[`SyncCoordinator`](#synccoordinator)

***

### deleteCustomerStorageByNames()

> **deleteCustomerStorageByNames**(`names`): `Promise`\<`void`\>

Defined in: [offline/customers.ts:197](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L197)

#### Parameters

##### names

`string`[]

#### Returns

`Promise`\<`void`\>

***

### deleteOfflineCashMovement()

> **deleteOfflineCashMovement**(`index`): `Promise`\<`void`\>

Defined in: [offline/cash\_movements.ts:43](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cash_movements.ts#L43)

#### Parameters

##### index

`number`

#### Returns

`Promise`\<`void`\>

***

### deleteOfflineCustomer()

> **deleteOfflineCustomer**(`index`): `Promise`\<`void`\>

Defined in: [offline/customers.ts:62](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L62)

#### Parameters

##### index

`number`

#### Returns

`Promise`\<`void`\>

***

### deleteOfflineInvoice()

> **deleteOfflineInvoice**(`index`): `Promise`\<`void`\>

Defined in: [offline/invoices.ts:242](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoices.ts#L242)

#### Parameters

##### index

`number`

#### Returns

`Promise`\<`void`\>

***

### deleteOfflinePayment()

> **deleteOfflinePayment**(`index`): `Promise`\<`void`\>

Defined in: [offline/payments.ts:59](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/payments.ts#L59)

#### Parameters

##### index

`number`

#### Returns

`Promise`\<`void`\>

***

### deleteStoredItemsByCodes()

> **deleteStoredItemsByCodes**(`itemCodes?`, `scope?`): `Promise`\<`void`\>

Defined in: [offline/cache.ts:491](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L491)

#### Parameters

##### itemCodes?

`string`[] = `[]`

##### scope?

`string` = `""`

#### Returns

`Promise`\<`void`\>

***

### deleteWriteQueueEntry()

> **deleteWriteQueueEntry**(`entityType`, `queueId`): `Promise`\<`void`\>

Defined in: [offline/writeQueue.ts:389](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L389)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

##### queueId

`number`

#### Returns

`Promise`\<`void`\>

***

### deleteWriteQueueEntryByIndex()

> **deleteWriteQueueEntryByIndex**(`entityType`, `index`): `Promise`\<`void`\>

Defined in: [offline/writeQueue.ts:398](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L398)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

##### index

`number`

#### Returns

`Promise`\<`void`\>

***

### enqueueInvoiceOutboxEntry()

> **enqueueInvoiceOutboxEntry**(`entry`): `Promise`\<`any`\>

Defined in: [offline/invoiceOutbox.ts:88](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L88)

#### Parameters

##### entry

`AnyRecord`

#### Returns

`Promise`\<`any`\>

***

### enqueueWriteQueueEntry()

> **enqueueWriteQueueEntry**(`entityType`, `payload`, `options?`): `Promise`\<`any`\>

Defined in: [offline/writeQueue.ts:380](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L380)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

##### payload

`AnyRecord`

##### options?

###### idempotencyKey?

`string`

#### Returns

`Promise`\<`any`\>

***

### ensureOfflineQueueReady()

> **ensureOfflineQueueReady**(): `Promise`\<`void`\>

Defined in: [offline/writeQueue.ts:600](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L600)

#### Returns

`Promise`\<`void`\>

***

### fetchItemStockQuantities()

> **fetchItemStockQuantities**(`items`, `pos_profile`, `chunkSize?`): `Promise`\<`AnyRecord`[] \| `null`\>

Defined in: [offline/stock.ts:6](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/stock.ts#L6)

#### Parameters

##### items

`AnyRecord`[]

##### pos\_profile

`AnyRecord`

##### chunkSize?

`number` = `100`

#### Returns

`Promise`\<`AnyRecord`[] \| `null`\>

***

### forceClearAllCache()

> **forceClearAllCache**(): `Promise`\<`void`\>

Defined in: [offline/db.ts:715](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L715)

#### Returns

`Promise`\<`void`\>

***

### getAllStoredItems()

> **getAllStoredItems**(`scope?`): `Promise`\<`any`\>

Defined in: [offline/cache.ts:338](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L338)

#### Parameters

##### scope?

`string` = `""`

#### Returns

`Promise`\<`any`\>

***

### getBootstrapLimitedMode()

> **getBootstrapLimitedMode**(): `boolean`

Defined in: [offline/cache.ts:928](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L928)

#### Returns

`boolean`

***

### getBootstrapSnapshot()

> **getBootstrapSnapshot**(): `any`

Defined in: [offline/cache.ts:870](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L870)

#### Returns

`any`

***

### getBootstrapSnapshotStatus()

> **getBootstrapSnapshotStatus**(): `any`

Defined in: [offline/cache.ts:913](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L913)

#### Returns

`any`

***

### getCachedCoupons()

> **getCachedCoupons**(): `any`

Defined in: [offline/cache.ts:1267](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1267)

#### Returns

`any`

***

### getCachedCurrencyOptions()

> **getCachedCurrencyOptions**(`profileName`, `ttlMs?`): `any`

Defined in: [offline/cache.ts:1376](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1376)

#### Parameters

##### profileName

`any`

##### ttlMs?

`number` = `DEFAULT_CACHE_TTL_MS`

#### Returns

`any`

***

### getCachedCustomerAddresses()

> **getCachedCustomerAddresses**(`customer`, `ttlMs?`): `any`

Defined in: [offline/cache.ts:1505](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1505)

#### Parameters

##### customer

`any`

##### ttlMs?

`number` = `DEFAULT_CACHE_TTL_MS`

#### Returns

`any`

***

### getCachedCustomerBalance()

> **getCachedCustomerBalance**(`customer`): `any`

Defined in: [offline/customers.ts:340](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L340)

#### Parameters

##### customer

`string`

#### Returns

`any`

***

### getCachedDeliveryCharges()

> **getCachedDeliveryCharges**(`profileName`, `customer`, `ttlMs?`): `any`

Defined in: [offline/cache.ts:1336](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1336)

#### Parameters

##### profileName

`any`

##### customer

`any`

##### ttlMs?

`number` = `DEFAULT_CACHE_TTL_MS`

#### Returns

`any`

***

### getCachedExchangeRate()

> **getCachedExchangeRate**(`entry?`, `ttlMs?`): `any`

Defined in: [offline/cache.ts:1420](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1420)

#### Parameters

##### entry?

`ExchangeRateCacheEntry` = `{}`

##### ttlMs?

`number` = `DEFAULT_CACHE_TTL_MS`

#### Returns

`any`

***

### getCachedGiftCardSnapshot()

> **getCachedGiftCardSnapshot**(`giftCardCode`): `any`

Defined in: [offline/customers.ts:300](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L300)

#### Parameters

##### giftCardCode

`string`

#### Returns

`any`

***

### getCachedItemDetails()

> **getCachedItemDetails**(`profileName`, `priceList`, `itemCodes`, `ttl?`): `Promise`\<\{ `cached`: `any`[]; `missing`: `string`[]; \}\>

Defined in: [offline/cache.ts:724](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L724)

Returns cached item details, split into `cached` (fresh) and `missing` (absent or stale)
groups so callers know exactly which items need a network fetch.

This function spans both storage tiers:
1. Reads per-item detail overrides from `memory.item_details_cache`
   (keyed by `profileName → priceList → item_code`, TTL 15 minutes).
2. For items that are fresh, fetches their base records from the Dexie `items` table
   and merges them: `result = { ...baseItem, ...detailOverride }`.

#### Parameters

##### profileName

`string`

POS profile name used as the first cache key dimension.

##### priceList

`string`

Price list name used as the second cache key dimension.

##### itemCodes

`string`[]

Item codes to look up.

##### ttl?

`number` = `...`

Cache TTL in milliseconds. Defaults to 15 minutes.

#### Returns

`Promise`\<\{ `cached`: `any`[]; `missing`: `string`[]; \}\>

`{ cached: mergedItems[], missing: itemCodes[] }`.

***

### getCachedItemGroups()

> **getCachedItemGroups**(): `any`

Defined in: [offline/cache.ts:1292](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1292)

#### Returns

`any`

***

### getCachedOffers()

> **getCachedOffers**(): `any`

Defined in: [offline/cache.ts:532](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L532)

#### Returns

`any`

***

### getCachedPaymentMethodCurrencyMap()

> **getCachedPaymentMethodCurrencyMap**(`company`, `ttlMs?`): `any`

Defined in: [offline/cache.ts:1545](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1545)

#### Parameters

##### company

`any`

##### ttlMs?

`number` = `DEFAULT_CACHE_TTL_MS`

#### Returns

`any`

***

### getCachedPriceListItems()

> **getCachedPriceListItems**(`priceList`): `any`

Defined in: [offline/cache.ts:562](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L562)

#### Parameters

##### priceList

`any`

#### Returns

`any`

***

### getCachedPriceListMeta()

> **getCachedPriceListMeta**(`profileName`, `ttlMs?`): `any`

Defined in: [offline/cache.ts:1465](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1465)

#### Parameters

##### profileName

`any`

##### ttlMs?

`number` = `DEFAULT_CACHE_TTL_MS`

#### Returns

`any`

***

### getCachedPricingRulesSnapshot()

> **getCachedPricingRulesSnapshot**(): `object`

Defined in: [offline/cache.ts:1166](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1166)

#### Returns

`object`

##### context

> **context**: `any`

##### lastSync

> **lastSync**: `any`

##### snapshot

> **snapshot**: `any`[]

##### staleAt

> **staleAt**: `any`

***

### getCachedStoredValueSnapshot()

> **getCachedStoredValueSnapshot**(`customer`, `company`): `any`

Defined in: [offline/customers.ts:256](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L256)

#### Parameters

##### customer

`string`

##### company

`string`

#### Returns

`any`

***

### getCacheUsageEstimate()

> **getCacheUsageEstimate**(): `Promise`\<\{ `indexedDB`: `number`; `localStorage`: `number`; `percentage`: `number`; `total`: `number`; \}\>

Defined in: [offline/cache.ts:1562](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1562)

#### Returns

`Promise`\<\{ `indexedDB`: `number`; `localStorage`: `number`; `percentage`: `number`; `total`: `number`; \}\>

***

### getCustomersLastSync()

> **getCustomersLastSync**(): `any`

Defined in: [offline/cache.ts:1108](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1108)

#### Returns

`any`

***

### getCustomerStorage()

> **getCustomerStorage**(): `any`

Defined in: [offline/customers.ts:125](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L125)

#### Returns

`any`

***

### getCustomerStorageCount()

> **getCustomerStorageCount**(): `Promise`\<`any`\>

Defined in: [offline/cache.ts:1112](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1112)

#### Returns

`Promise`\<`any`\>

***

### getInvoiceOutboxMode()

> **getInvoiceOutboxMode**(): [`InvoiceOutboxMode`](#invoiceoutboxmode)

Defined in: [offline/invoiceOutbox.ts:65](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L65)

#### Returns

[`InvoiceOutboxMode`](#invoiceoutboxmode)

***

### getInvoiceOutboxRows()

> **getInvoiceOutboxRows**(`options?`): `Promise`\<[`InvoiceOutboxEntry`](#invoiceoutboxentry)[]\>

Defined in: [offline/invoiceOutbox.ts:127](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L127)

#### Parameters

##### options?

###### includeTerminal?

`boolean`

#### Returns

`Promise`\<[`InvoiceOutboxEntry`](#invoiceoutboxentry)[]\>

***

### getItemsLastSync()

> **getItemsLastSync**(): `any`

Defined in: [offline/cache.ts:1099](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1099)

#### Returns

`any`

***

### getItemUOMs()

> **getItemUOMs**(`itemCode`): `any`

Defined in: [offline/cache.ts:470](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L470)

#### Parameters

##### itemCode

`any`

#### Returns

`any`

***

### getLastSyncTotals()

> **getLastSyncTotals**(): `any`

Defined in: [offline/invoices.ts:267](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoices.ts#L267)

#### Returns

`any`

***

### getLocalStock()

> **getLocalStock**(`itemCode`): `any`

Defined in: [offline/stock.ts:150](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/stock.ts#L150)

#### Parameters

##### itemCode

`string`

#### Returns

`any`

***

### getLocalStockCache()

> **getLocalStockCache**(): `any`

Defined in: [offline/stock.ts:254](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/stock.ts#L254)

#### Returns

`any`

***

### getOfflineCashMovements()

> **getOfflineCashMovements**(): `any`[]

Defined in: [offline/cash\_movements.ts:35](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cash_movements.ts#L35)

#### Returns

`any`[]

***

### getOfflineCustomers()

> **getOfflineCustomers**(): `any`[]

Defined in: [offline/customers.ts:54](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L54)

#### Returns

`any`[]

***

### getOfflineInvoices()

> **getOfflineInvoices**(): `any`[]

Defined in: [offline/invoices.ts:234](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoices.ts#L234)

#### Returns

`any`[]

***

### getOfflinePayments()

> **getOfflinePayments**(): `any`[]

Defined in: [offline/payments.ts:51](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/payments.ts#L51)

#### Returns

`any`[]

***

### getOpeningDialogStorage()

> **getOpeningDialogStorage**(): `any`

Defined in: [offline/cache.ts:1020](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1020)

#### Returns

`any`

***

### getOpeningStorage()

> **getOpeningStorage**(): `any`

Defined in: [offline/cache.ts:866](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L866)

#### Returns

`any`

***

### getPendingInvoiceOutboxCount()

> **getPendingInvoiceOutboxCount**(): `Promise`\<`number`\>

Defined in: [offline/invoiceOutbox.ts:140](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L140)

#### Returns

`Promise`\<`number`\>

***

### getPendingOfflineCashMovementCount()

> **getPendingOfflineCashMovementCount**(): `any`

Defined in: [offline/cash\_movements.ts:47](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cash_movements.ts#L47)

#### Returns

`any`

***

### getPendingOfflineCustomerCount()

> **getPendingOfflineCustomerCount**(): `any`

Defined in: [offline/customers.ts:66](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L66)

#### Returns

`any`

***

### getPendingOfflineInvoiceCount()

> **getPendingOfflineInvoiceCount**(): `any`

Defined in: [offline/invoices.ts:246](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoices.ts#L246)

#### Returns

`any`

***

### getPendingOfflinePaymentCount()

> **getPendingOfflinePaymentCount**(): `any`

Defined in: [offline/payments.ts:63](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/payments.ts#L63)

#### Returns

`any`

***

### getPrintTemplate()

> **getPrintTemplate**(): `any`

Defined in: [offline/cache.ts:1214](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1214)

#### Returns

`any`

***

### getQueuedPayloadCount()

> **getQueuedPayloadCount**(`entityType`): `any`

Defined in: [offline/writeQueue.ts:622](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L622)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

#### Returns

`any`

***

### getQueuedPayloadSnapshots()

> **getQueuedPayloadSnapshots**(`entityType`): `any`[]

Defined in: [offline/writeQueue.ts:615](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L615)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

#### Returns

`any`[]

***

### getQueueEntries()

> **getQueueEntries**(`entityType`, `options?`): `Promise`\<[`OfflineQueueEntry`](#offlinequeueentry)[]\>

Defined in: [offline/writeQueue.ts:292](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L292)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

##### options?

###### includeSynced?

`boolean`

###### statuses?

[`OfflineQueueStatus`](#offlinequeuestatus)[]

#### Returns

`Promise`\<[`OfflineQueueEntry`](#offlinequeueentry)[]\>

***

### getSalesPersonsStorage()

> **getSalesPersonsStorage**(): `any`

Defined in: [offline/cache.ts:850](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L850)

#### Returns

`any`

***

### getStoredCustomer()

> **getStoredCustomer**(`customerName`): `Promise`\<`any`\>

Defined in: [offline/customers.ts:152](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L152)

#### Parameters

##### customerName

`string`

#### Returns

`Promise`\<`any`\>

***

### ~~getStoredItems()~~

> **getStoredItems**(): `Promise`\<`any`\>

Defined in: [offline/cache.ts:252](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L252)

#### Returns

`Promise`\<`any`\>

#### Deprecated

Avoid unscoped reads. Prefer `getAllStoredItems(scope)` with an explicit scope.

***

### getStoredItemsCount()

> **getStoredItemsCount**(): `Promise`\<`any`\>

Defined in: [offline/cache.ts:313](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L313)

#### Returns

`Promise`\<`any`\>

***

### getStoredItemsCountByScope()

> **getStoredItemsCountByScope**(`scope?`): `Promise`\<`any`\>

Defined in: [offline/cache.ts:324](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L324)

#### Parameters

##### scope?

`string` = `""`

#### Returns

`Promise`\<`any`\>

***

### getSyncResourceDefinitions()

> **getSyncResourceDefinitions**(): [`SyncResourceDefinition`](#syncresourcedefinition)[]

Defined in: [offline/sync/resourceRegistry.ts:194](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/resourceRegistry.ts#L194)

Returns a shallow copy of all resource definitions with cloned `triggers` arrays.
Callers receive mutable copies so that the frozen registry cannot be accidentally mutated.

#### Returns

[`SyncResourceDefinition`](#syncresourcedefinition)[]

***

### getSyncResourcesByPriority()

> **getSyncResourcesByPriority**(`priority`): [`SyncResourceDefinition`](#syncresourcedefinition)[]

Defined in: [offline/sync/resourceRegistry.ts:206](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/resourceRegistry.ts#L206)

Returns all resource definitions with the given `priority`.
Used by `SyncCoordinator` to process resources in priority order
(`"boot_critical"` → `"warm"` → `"lazy"`).

#### Parameters

##### priority

[`SyncResourcePriority`](#syncresourcepriority)

#### Returns

[`SyncResourceDefinition`](#syncresourcedefinition)[]

***

### getSyncResourcesForTrigger()

> **getSyncResourcesForTrigger**(`trigger`): [`SyncResourceDefinition`](#syncresourcedefinition)[]

Defined in: [offline/sync/resourceRegistry.ts:219](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/resourceRegistry.ts#L219)

Returns all resource definitions whose `triggers` array includes `trigger`.
Used by `SyncCoordinator` at the start of each trigger run to build
the work list for that event.

#### Parameters

##### trigger

[`SyncTrigger`](#synctrigger)

#### Returns

[`SyncResourceDefinition`](#syncresourcedefinition)[]

***

### getSyncResourceState()

> **getSyncResourceState**(`resourceId`): `Promise`\<[`SyncResourceState`](#syncresourcestate) \| `null`\>

Defined in: [offline/sync/syncState.ts:74](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/syncState.ts#L74)

#### Parameters

##### resourceId

[`SyncResourceId`](#syncresourceid)

#### Returns

`Promise`\<[`SyncResourceState`](#syncresourcestate) \| `null`\>

***

### getTaxInclusiveSetting()

> **getTaxInclusiveSetting**(): `boolean`

Defined in: [offline/cache.ts:1033](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1033)

#### Returns

`boolean`

***

### getTaxTemplate()

> **getTaxTemplate**(`name`): `any`

Defined in: [offline/cache.ts:840](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L840)

#### Parameters

##### name

`any`

#### Returns

`any`

***

### getTermsAndConditions()

> **getTermsAndConditions**(): `any`

Defined in: [offline/cache.ts:1234](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1234)

#### Returns

`any`

***

### getTranslationsCache()

> **getTranslationsCache**(`lang`): `any`

Defined in: [offline/cache.ts:1193](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1193)

#### Parameters

##### lang

`any`

#### Returns

`any`

***

### initializeStockCache()

> **initializeStockCache**(`items`, `pos_profile`): `Promise`\<`boolean`\>

Defined in: [offline/stock.ts:48](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/stock.ts#L48)

#### Parameters

##### items

`AnyRecord`[]

##### pos\_profile

`AnyRecord`

#### Returns

`Promise`\<`boolean`\>

***

### isManualOffline()

> **isManualOffline**(): `any`

Defined in: [offline/db.ts:652](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L652)

#### Returns

`any`

***

### isOffline()

> **isOffline**(): `any`

Defined in: [offline/db.ts:620](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L620)

#### Returns

`any`

***

### isStockCacheReady()

> **isStockCacheReady**(): `any`

Defined in: [offline/stock.ts:109](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/stock.ts#L109)

#### Returns

`any`

***

### listSyncResourceStates()

> **listSyncResourceStates**(): `Promise`\<[`SyncResourceState`](#syncresourcestate)[]\>

Defined in: [offline/sync/syncState.ts:87](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/syncState.ts#L87)

#### Returns

`Promise`\<[`SyncResourceState`](#syncresourcestate)[]\>

***

### markWriteQueueEntryFailed()

> **markWriteQueueEntryFailed**(`entityType`, `queueId`, `error`, `expectedLastAttemptAt`): `Promise`\<`any`\>

Defined in: [offline/writeQueue.ts:524](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L524)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

##### queueId

`number`

##### error

`unknown`

##### expectedLastAttemptAt

`string` \| `null` \| `undefined`

#### Returns

`Promise`\<`any`\>

***

### markWriteQueueEntrySynced()

> **markWriteQueueEntrySynced**(`entityType`, `queueId`, `expectedLastAttemptAt`): `Promise`\<`any`\>

Defined in: [offline/writeQueue.ts:503](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L503)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

##### queueId

`number`

##### expectedLastAttemptAt

`string` \| `null` \| `undefined`

#### Returns

`Promise`\<`any`\>

***

### mergeCachedPriceListItems()

> **mergeCachedPriceListItems**(`priceList`, `items?`): `void`

Defined in: [offline/cache.ts:587](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L587)

#### Parameters

##### priceList

`any`

##### items?

`Record`\<`string`, `any`\>[] = `[]`

#### Returns

`void`

***

### migrateLegacyOfflineQueues()

> **migrateLegacyOfflineQueues**(): `Promise`\<`void`\>

Defined in: [offline/writeQueue.ts:581](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L581)

#### Returns

`Promise`\<`void`\>

***

### persist()

> **persist**(`key`, `value?`): `void`

Defined in: [offline/db.ts:577](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L577)

#### Parameters

##### key

`string`

##### value?

`unknown` = `...`

#### Returns

`void`

***

### pruneOfflineStorage()

> **pruneOfflineStorage**(`options?`): `Promise`\<[`OfflinePruneResult`](#offlinepruneresult)\>

Defined in: [offline/db.ts:478](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L478)

#### Parameters

##### options?

###### maxAgeDays?

`number`

###### now?

`number`

#### Returns

`Promise`\<[`OfflinePruneResult`](#offlinepruneresult)\>

***

### purgeOldQueueEntries()

> **purgeOldQueueEntries**(): `void`

Defined in: [offline/db.ts:825](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L825)

#### Returns

`void`

***

### queueHealthCheck()

> **queueHealthCheck**(): `boolean`

Defined in: [offline/db.ts:815](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L815)

#### Returns

`boolean`

***

### quickDbHealthCheck()

> **quickDbHealthCheck**(): `Promise`\<`boolean`\>

Defined in: [offline/db.ts:772](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L772)

#### Returns

`Promise`\<`boolean`\>

***

### reduceCacheUsage()

> **reduceCacheUsage**(): `void`

Defined in: [offline/cache.ts:1056](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1056)

Clears all `memory`-tier caches to free up localStorage space under memory pressure.

**Does NOT touch the Dexie IndexedDB tables** (`items`, `customers`, etc.). Those are
preserved so the POS can continue operating offline. Only the faster, smaller
`memory`-tier caches (price lists, item details, exchange rates, etc.) are emptied.
All cleared keys are immediately persisted so that the empty state survives a reload.

Callers should expect that any `getCached*` call after this returns `null` / empty until
the relevant sync adapter re-populates the cache.

#### Returns

`void`

***

### refreshAllQueueMemory()

> **refreshAllQueueMemory**(): `Promise`\<`void`\>

Defined in: [offline/writeQueue.ts:325](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L325)

#### Returns

`Promise`\<`void`\>

***

### refreshBootstrapSnapshotFromCacheState()

> **refreshBootstrapSnapshotFromCacheState**(`cacheState?`): `void`

Defined in: [offline/cache.ts:888](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L888)

Re-evaluates the stored bootstrap snapshot against the current cache state and
persists the updated snapshot.

Called as a side effect by most `save*` functions in this module. Callers pass a
partial `cacheState` object describing what changed (e.g. `{ offers: [...] }`);
`refreshBootstrapSnapshotFromCaches` merges it with the rest of the current snapshot
to produce an updated readiness record.

This is the mechanism that keeps the offline-readiness banner in sync with actual
cache state without a dedicated polling loop.

#### Parameters

##### cacheState?

Partial cache state describing what was just written.

#### Returns

`void`

***

### refreshQueueMemory()

> **refreshQueueMemory**(`entityType`): `Promise`\<`void`\>

Defined in: [offline/writeQueue.ts:318](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L318)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

#### Returns

`Promise`\<`void`\>

***

### removeCachedPriceListItems()

> **removeCachedPriceListItems**(`itemCodes?`, `priceList?`): `void`

Defined in: [offline/cache.ts:630](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L630)

#### Parameters

##### itemCodes?

`string`[] = `[]`

##### priceList?

`string` \| `null`

#### Returns

`void`

***

### removeItemDetailsCacheEntries()

> **removeItemDetailsCacheEntries**(`profileName`, `itemCodes?`, `priceList?`): `void`

Defined in: [offline/cache.ts:776](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L776)

#### Parameters

##### profileName

`any`

##### itemCodes?

`string`[] = `[]`

##### priceList?

`string` \| `null`

#### Returns

`void`

***

### removeLocalStockEntries()

> **removeLocalStockEntries**(`itemCodes`): `void`

Defined in: [offline/stock.ts:187](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/stock.ts#L187)

#### Parameters

##### itemCodes

`string`[]

#### Returns

`void`

***

### repairDbAfterFailedHealthCheck()

> **repairDbAfterFailedHealthCheck**(`error?`): `Promise`\<`boolean`\>

Defined in: [offline/db.ts:785](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L785)

#### Parameters

##### error?

`unknown`

#### Returns

`Promise`\<`boolean`\>

***

### resetOfflineState()

> **resetOfflineState**(): `void`

Defined in: [offline/invoices.ts:250](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoices.ts#L250)

#### Returns

`void`

***

### resetSyncCoordinatorForTests()

> **resetSyncCoordinatorForTests**(): `void`

Defined in: [offline/sync/useSyncCoordinator.ts:15](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/useSyncCoordinator.ts#L15)

#### Returns

`void`

***

### safeBulkDelete()

> **safeBulkDelete**(`tableName`, `keys`): `Promise`\<`void`\>

Defined in: [offline/db.ts:447](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L447)

#### Parameters

##### tableName

`string`

##### keys

(`string` \| `number`)[]

#### Returns

`Promise`\<`void`\>

***

### safeBulkPut()

> **safeBulkPut**\<`T`\>(`tableName`, `rows`): `Promise`\<`void`\>

Defined in: [offline/db.ts:421](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L421)

#### Type Parameters

##### T

`T` *extends* `AnyRecord`

#### Parameters

##### tableName

`string`

##### rows

`T`[]

#### Returns

`Promise`\<`void`\>

***

### saveCoupons()

> **saveCoupons**(`coupons`): `void`

Defined in: [offline/cache.ts:1255](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1255)

#### Parameters

##### coupons

`any`

#### Returns

`void`

***

### saveCurrencyOptionsCache()

> **saveCurrencyOptionsCache**(`profileName`, `currencies`): `void`

Defined in: [offline/cache.ts:1354](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1354)

#### Parameters

##### profileName

`any`

##### currencies

`any`

#### Returns

`void`

***

### saveCustomerAddressesCache()

> **saveCustomerAddressesCache**(`customer`, `addresses`): `void`

Defined in: [offline/cache.ts:1482](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1482)

#### Parameters

##### customer

`any`

##### addresses

`any`

#### Returns

`void`

***

### saveCustomerBalance()

> **saveCustomerBalance**(`customer`, `balance`): `void`

Defined in: [offline/customers.ts:326](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L326)

#### Parameters

##### customer

`string`

##### balance

`number`

#### Returns

`void`

***

### saveDeliveryChargesCache()

> **saveDeliveryChargesCache**(`profileName`, `customer`, `deliveryCharges`): `void`

Defined in: [offline/cache.ts:1310](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1310)

#### Parameters

##### profileName

`any`

##### customer

`any`

##### deliveryCharges

`any`

#### Returns

`void`

***

### saveExchangeRateCache()

> **saveExchangeRateCache**(`entry?`): `void`

Defined in: [offline/cache.ts:1393](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1393)

#### Parameters

##### entry?

`ExchangeRateCacheEntry` = `{}`

#### Returns

`void`

***

### saveGiftCardSnapshot()

> **saveGiftCardSnapshot**(`giftCardCode`, `snapshot`): `void`

Defined in: [offline/customers.ts:282](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L282)

#### Parameters

##### giftCardCode

`string`

##### snapshot

`AnyRecord`

#### Returns

`void`

***

### saveItemDetailsCache()

> **saveItemDetailsCache**(`profileName`, `priceList`, `items`): `void`

Defined in: [offline/cache.ts:670](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L670)

#### Parameters

##### profileName

`any`

##### priceList

`any`

##### items

`any`

#### Returns

`void`

***

### saveItemGroups()

> **saveItemGroups**(`groups`): `void`

Defined in: [offline/cache.ts:1280](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1280)

#### Parameters

##### groups

`any`

#### Returns

`void`

***

### saveItems()

> **saveItems**(`items`, `scope?`): `Promise`\<`void`\>

Defined in: [offline/cache.ts:359](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L359)

#### Parameters

##### items

`any`

##### scope?

`string` = `""`

#### Returns

`Promise`\<`void`\>

***

### saveItemsBulk()

> **saveItemsBulk**(`items`, `scope?`): `Promise`\<`void`\>

Defined in: [offline/cache.ts:355](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L355)

#### Parameters

##### items

`any`

##### scope?

`string` = `""`

#### Returns

`Promise`\<`void`\>

***

### saveItemUOMs()

> **saveItemUOMs**(`itemCode`, `uoms`): `void`

Defined in: [offline/cache.ts:458](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L458)

#### Parameters

##### itemCode

`any`

##### uoms

`any`

#### Returns

`void`

***

### saveOffers()

> **saveOffers**(`offers`): `void`

Defined in: [offline/cache.ts:479](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L479)

#### Parameters

##### offers

`any`

#### Returns

`void`

***

### saveOfflineCashMovement()

> **saveOfflineCashMovement**(`entry`): `Promise`\<`any`\>

Defined in: [offline/cash\_movements.ts:23](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cash_movements.ts#L23)

#### Parameters

##### entry

`AnyRecord`

#### Returns

`Promise`\<`any`\>

***

### saveOfflineCustomer()

> **saveOfflineCustomer**(`entry`): `Promise`\<`any`\>

Defined in: [offline/customers.ts:20](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L20)

#### Parameters

##### entry

`AnyRecord`

#### Returns

`Promise`\<`any`\>

***

### saveOfflineInvoice()

> **saveOfflineInvoice**(`entry`): `Promise`\<`any`\>

Defined in: [offline/invoices.ts:214](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoices.ts#L214)

#### Parameters

##### entry

`AnyRecord`

#### Returns

`Promise`\<`any`\>

***

### saveOfflinePayment()

> **saveOfflinePayment**(`entry`): `Promise`\<`any`\>

Defined in: [offline/payments.ts:41](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/payments.ts#L41)

#### Parameters

##### entry

`AnyRecord`

#### Returns

`Promise`\<`any`\>

***

### savePaymentMethodCurrencyCache()

> **savePaymentMethodCurrencyCache**(`company`, `mapping`): `void`

Defined in: [offline/cache.ts:1522](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1522)

#### Parameters

##### company

`any`

##### mapping

`any`

#### Returns

`void`

***

### savePriceListItems()

> **savePriceListItems**(`priceList`, `items`): `void`

Defined in: [offline/cache.ts:540](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L540)

#### Parameters

##### priceList

`any`

##### items

`any`

#### Returns

`void`

***

### savePriceListMetaCache()

> **savePriceListMetaCache**(`profileName`, `metadata`): `void`

Defined in: [offline/cache.ts:1443](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1443)

#### Parameters

##### profileName

`any`

##### metadata

`any`

#### Returns

`void`

***

### savePricingRulesSnapshot()

> **savePricingRulesSnapshot**(`snapshot?`, `context?`, `staleAt?`): `void`

Defined in: [offline/cache.ts:1146](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1146)

#### Parameters

##### snapshot?

`never`[] = `[]`

##### context?

`null` = `null`

##### staleAt?

`null` = `null`

#### Returns

`void`

***

### saveStoredValueSnapshot()

> **saveStoredValueSnapshot**(`customer`, `company`, `sources`): `void`

Defined in: [offline/customers.ts:225](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L225)

#### Parameters

##### customer

`string`

##### company

`string`

##### sources

`AnyRecord`[]

#### Returns

`void`

***

### saveTaxTemplate()

> **saveTaxTemplate**(`name`, `doc`): `void`

Defined in: [offline/cache.ts:826](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L826)

#### Parameters

##### name

`any`

##### doc

`any`

#### Returns

`void`

***

### saveTranslationsCache()

> **saveTranslationsCache**(`lang`, `data`): `void`

Defined in: [offline/cache.ts:1203](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1203)

#### Parameters

##### lang

`any`

##### data

`any`

#### Returns

`void`

***

### scheduleIdleOfflinePruning()

> **scheduleIdleOfflinePruning**(): `void`

Defined in: [offline/db.ts:560](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L560)

#### Returns

`void`

***

### searchStoredItems()

> **searchStoredItems**(`__namedParameters?`): `Promise`\<`any`\>

Defined in: [offline/cache.ts:263](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L263)

#### Parameters

##### \_\_namedParameters?

###### itemGroup?

`string` = `""`

###### limit?

`number` = `100`

###### offset?

`number` = `0`

###### scope?

`string` = `""`

###### search?

`string` = `""`

#### Returns

`Promise`\<`any`\>

***

### setBootstrapLimitedMode()

> **setBootstrapLimitedMode**(`state`): `void`

Defined in: [offline/cache.ts:932](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L932)

#### Parameters

##### state

`any`

#### Returns

`void`

***

### setBootstrapSnapshot()

> **setBootstrapSnapshot**(`snapshot`): `void`

Defined in: [offline/cache.ts:901](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L901)

#### Parameters

##### snapshot

`any`

#### Returns

`void`

***

### setBootstrapSnapshotStatus()

> **setBootstrapSnapshotStatus**(`status`): `void`

Defined in: [offline/cache.ts:917](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L917)

#### Parameters

##### status

`any`

#### Returns

`void`

***

### setCustomersLastSync()

> **setCustomersLastSync**(`timestamp`): `void`

Defined in: [offline/cache.ts:1103](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1103)

#### Parameters

##### timestamp

`any`

#### Returns

`void`

***

### setCustomerStorage()

> **setCustomerStorage**(`customers`): `Promise`\<`void`\>

Defined in: [offline/customers.ts:177](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L177)

#### Parameters

##### customers

`AnyRecord`[]

#### Returns

`Promise`\<`void`\>

***

### setInvoiceOutboxMode()

> **setInvoiceOutboxMode**(`mode`): `void`

Defined in: [offline/invoiceOutbox.ts:70](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L70)

#### Parameters

##### mode

[`InvoiceOutboxMode`](#invoiceoutboxmode)

#### Returns

`void`

***

### setItemsLastSync()

> **setItemsLastSync**(`timestamp`): `void`

Defined in: [offline/cache.ts:1094](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1094)

#### Parameters

##### timestamp

`any`

#### Returns

`void`

***

### setLastSyncTotals()

> **setLastSyncTotals**(`totals`): `void`

Defined in: [offline/invoices.ts:258](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoices.ts#L258)

#### Parameters

##### totals

###### drafted

`number`

###### pending

`number`

###### synced

`number`

#### Returns

`void`

***

### setLocalStockCache()

> **setLocalStockCache**(`cache`): `void`

Defined in: [offline/stock.ts:258](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/stock.ts#L258)

#### Parameters

##### cache

`AnyRecord`

#### Returns

`void`

***

### setManualOffline()

> **setManualOffline**(`state`): `void`

Defined in: [offline/db.ts:656](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L656)

#### Parameters

##### state

`any`

#### Returns

`void`

***

### setOpeningDialogStorage()

> **setOpeningDialogStorage**(`data`): `void`

Defined in: [offline/cache.ts:1024](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1024)

#### Parameters

##### data

`any`

#### Returns

`void`

***

### setOpeningStorage()

> **setOpeningStorage**(`data`): `void`

Defined in: [offline/cache.ts:995](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L995)

#### Parameters

##### data

`any`

#### Returns

`void`

***

### setPrintTemplate()

> **setPrintTemplate**(`template`): `void`

Defined in: [offline/cache.ts:1222](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1222)

#### Parameters

##### template

`any`

#### Returns

`void`

***

### setSalesPersonsStorage()

> **setSalesPersonsStorage**(`data`): `void`

Defined in: [offline/cache.ts:854](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L854)

#### Parameters

##### data

`any`

#### Returns

`void`

***

### setStockCacheReady()

> **setStockCacheReady**(`ready`): `void`

Defined in: [offline/stock.ts:113](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/stock.ts#L113)

#### Parameters

##### ready

`boolean`

#### Returns

`void`

***

### setSyncResourceState()

> **setSyncResourceState**(`state`): `Promise`\<`void`\>

Defined in: [offline/sync/syncState.ts:41](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/syncState.ts#L41)

#### Parameters

##### state

[`SyncResourceState`](#syncresourcestate)

#### Returns

`Promise`\<`void`\>

***

### setSyncResourceStates()

> **setSyncResourceStates**(`states`): `Promise`\<`void`\>

Defined in: [offline/sync/syncState.ts:58](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/syncState.ts#L58)

#### Parameters

##### states

[`SyncResourceState`](#syncresourcestate)[]

#### Returns

`Promise`\<`void`\>

***

### setTaxInclusiveSetting()

> **setTaxInclusiveSetting**(`value`): `void`

Defined in: [offline/cache.ts:1037](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1037)

#### Parameters

##### value

`any`

#### Returns

`void`

***

### setTermsAndConditions()

> **setTermsAndConditions**(`terms`): `void`

Defined in: [offline/cache.ts:1242](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L1242)

#### Parameters

##### terms

`any`

#### Returns

`void`

***

### shouldWriteInvoiceOutbox()

> **shouldWriteInvoiceOutbox**(): `boolean`

Defined in: [offline/invoiceOutbox.ts:75](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L75)

#### Returns

`boolean`

***

### syncBootstrapConfigResource()

> **syncBootstrapConfigResource**(`args`): `Promise`\<`ResourceSyncResult`\>

Defined in: [offline/sync/adapters/bootstrapConfig.ts:48](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/adapters/bootstrapConfig.ts#L48)

#### Parameters

##### args

`BootCriticalSyncArgs`

#### Returns

`Promise`\<`ResourceSyncResult`\>

***

### syncCurrencyMatrixResource()

> **syncCurrencyMatrixResource**(`args`): `Promise`\<`ResourceSyncResult`\>

Defined in: [offline/sync/adapters/currencyMatrix.ts:34](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/adapters/currencyMatrix.ts#L34)

#### Parameters

##### args

`CurrencyMatrixSyncArgs`

#### Returns

`Promise`\<`ResourceSyncResult`\>

***

### syncCustomersResource()

> **syncCustomersResource**(`args`): `Promise`\<`ResourceSyncResult`\>

Defined in: [offline/sync/adapters/customers.ts:61](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/adapters/customers.ts#L61)

#### Parameters

##### args

`CustomersSyncArgs`

#### Returns

`Promise`\<`ResourceSyncResult`\>

***

### syncInvoiceOutboxResource()

> **syncInvoiceOutboxResource**(`callOfflineSyncMethod`): `Promise`\<\{ `acknowledged`: `number`; `consecutiveFailures`: `number`; `lastError`: `string` \| `null`; `lastSyncedAt`: `string`; `pendingCount`: `number`; `resourceId`: `string`; `status`: `string`; `watermark`: `string`; \}\>

Defined in: [offline/invoiceOutbox.ts:198](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L198)

#### Parameters

##### callOfflineSyncMethod

(`method`, `args?`) => `Promise`\<`any`\>

#### Returns

`Promise`\<\{ `acknowledged`: `number`; `consecutiveFailures`: `number`; `lastError`: `string` \| `null`; `lastSyncedAt`: `string`; `pendingCount`: `number`; `resourceId`: `string`; `status`: `string`; `watermark`: `string`; \}\>

***

### syncItemsResource()

> **syncItemsResource**(`args`): `Promise`\<`ResourceSyncResult`\>

Defined in: [offline/sync/adapters/items.ts:95](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/adapters/items.ts#L95)

#### Parameters

##### args

`ItemsSyncArgs`

#### Returns

`Promise`\<`ResourceSyncResult`\>

***

### syncOfflineCashMovements()

> **syncOfflineCashMovements**(): `Promise`\<\{ `pending`: `any`; `synced`: `number`; \}\>

Defined in: [offline/cash\_movements.ts:72](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cash_movements.ts#L72)

#### Returns

`Promise`\<\{ `pending`: `any`; `synced`: `number`; \}\>

***

### syncOfflineCustomers()

> **syncOfflineCustomers**(): `Promise`\<\{ `pending`: `any`; `synced`: `number`; \}\>

Defined in: [offline/customers.ts:70](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L70)

#### Returns

`Promise`\<\{ `pending`: `any`; `synced`: `number`; \}\>

***

### syncOfflineInvoices()

> **syncOfflineInvoices**(): `Promise`\<\{ `drafted`: `number`; `pending`: `any`; `synced`: `number`; \}\>

Defined in: [offline/invoices.ts:271](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoices.ts#L271)

#### Returns

`Promise`\<\{ `drafted`: `number`; `pending`: `any`; `synced`: `number`; \}\>

***

### syncOfflinePayments()

> **syncOfflinePayments**(): `Promise`\<\{ `pending`: `any`; `synced`: `number`; \}\>

Defined in: [offline/payments.ts:67](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/payments.ts#L67)

#### Returns

`Promise`\<\{ `pending`: `any`; `synced`: `number`; \}\>

***

### syncPaymentMethodCurrenciesResource()

> **syncPaymentMethodCurrenciesResource**(`args`): `Promise`\<`ResourceSyncResult`\>

Defined in: [offline/sync/adapters/paymentMethodCurrencies.ts:24](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/adapters/paymentMethodCurrencies.ts#L24)

#### Parameters

##### args

`PaymentMethodSyncArgs`

#### Returns

`Promise`\<`ResourceSyncResult`\>

***

### syncPriceListMetaResource()

> **syncPriceListMetaResource**(`args`): `Promise`\<`ResourceSyncResult`\>

Defined in: [offline/sync/adapters/bootstrapConfig.ts:92](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/adapters/bootstrapConfig.ts#L92)

#### Parameters

##### args

`BootCriticalSyncArgs`

#### Returns

`Promise`\<`ResourceSyncResult`\>

***

### syncStockResource()

> **syncStockResource**(`args`): `Promise`\<`ResourceSyncResult`\>

Defined in: [offline/sync/adapters/stock.ts:55](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/adapters/stock.ts#L55)

#### Parameters

##### args

`StockSyncArgs`

#### Returns

`Promise`\<`ResourceSyncResult`\>

***

### toggleManualOffline()

> **toggleManualOffline**(): `void`

Defined in: [offline/db.ts:661](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L661)

#### Returns

`void`

***

### updateLocalStock()

> **updateLocalStock**(`items`): `void`

Defined in: [offline/stock.ts:121](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/stock.ts#L121)

#### Parameters

##### items

`AnyRecord`[]

#### Returns

`void`

***

### updateLocalStockCache()

> **updateLocalStockCache**(`items`): `void`

Defined in: [offline/stock.ts:159](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/stock.ts#L159)

#### Parameters

##### items

`AnyRecord`[]

#### Returns

`void`

***

### updateLocalStockWithActualQuantities()

> **updateLocalStockWithActualQuantities**(`invoiceItems`, `serverItems`): `void`

Defined in: [offline/stock.ts:210](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/stock.ts#L210)

#### Parameters

##### invoiceItems

`AnyRecord`[]

##### serverItems

`AnyRecord`[]

#### Returns

`void`

***

### updateOfflineInvoicesCustomer()

> **updateOfflineInvoicesCustomer**(`oldName`, `newName`): `Promise`\<`void`\>

Defined in: [offline/customers.ts:32](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/customers.ts#L32)

#### Parameters

##### oldName

`string`

##### newName

`string`

#### Returns

`Promise`\<`void`\>

***

### updateQueuedPayloads()

> **updateQueuedPayloads**(`entityType`, `updater`): `Promise`\<`void`\>

Defined in: [offline/writeQueue.ts:553](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L553)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

##### updater

(`payload`) => `AnyRecord`

#### Returns

`Promise`\<`void`\>

***

### useSyncCoordinator()

> **useSyncCoordinator**(): [`SyncCoordinator`](#synccoordinator)

Defined in: [offline/sync/useSyncCoordinator.ts:8](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/useSyncCoordinator.ts#L8)

#### Returns

[`SyncCoordinator`](#synccoordinator)

***

### validateStockForOfflineInvoice()

> **validateStockForOfflineInvoice**(`items`, `invoice?`): `object`

Defined in: [offline/invoices.ts:62](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoices.ts#L62)

#### Parameters

##### items

`AnyRecord`[]

##### invoice?

`AnyRecord` = `{}`

#### Returns

`object`

##### errorMessage

> **errorMessage**: `string`

##### invalidItems

> **invalidItems**: `AnyRecord`[]

##### isValid

> **isValid**: `boolean`

***

### withDbTransaction()

> **withDbTransaction**\<`T`\>(`mode`, `tableNames`, `callback`): `Promise`\<`T`\>

Defined in: [offline/db.ts:410](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L410)

#### Type Parameters

##### T

`T`

#### Parameters

##### mode

`"r"` \| `"rw"`

##### tableNames

`string` \| `string`[]

##### callback

() => `T` \| `Promise`\<`T`\>

#### Returns

`Promise`\<`T`\>

## Classes

### SyncCoordinator

Defined in: [offline/sync/SyncCoordinator.ts:109](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/SyncCoordinator.ts#L109)

Orchestrates offline background synchronisation for all registered resources.

Resources are processed in priority order (`boot_critical` → `warm` → `lazy`) with
configurable concurrency. Each trigger run is deduplicated — a second call for the
same trigger while one is already in flight returns the existing Promise.

#### Example

```ts
import { createDefaultSyncCoordinator } from "@/offline";

const coordinator = createDefaultSyncCoordinator();
coordinator.runTrigger("boot");
```

#### Constructors

##### Constructor

> **new SyncCoordinator**(`options?`): [`SyncCoordinator`](#synccoordinator)

Defined in: [offline/sync/SyncCoordinator.ts:128](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/SyncCoordinator.ts#L128)

###### Parameters

###### options?

`SyncCoordinatorOptions` = `{}`

###### Returns

[`SyncCoordinator`](#synccoordinator)

#### Methods

##### getLastRunSummary()

> **getLastRunSummary**(): `any`

Defined in: [offline/sync/SyncCoordinator.ts:166](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/SyncCoordinator.ts#L166)

###### Returns

`any`

##### getResourceState()

> **getResourceState**(`resourceId`): \{ `consecutiveFailures`: `number`; `cooldownMs?`: `number` \| `null`; `lastAttemptAt?`: `string` \| `null`; `lastError`: `string` \| `null`; `lastSuccessHash`: `string` \| `null`; `lastSyncedAt`: `string` \| `null`; `lastTrigger?`: [`SyncTrigger`](#synctrigger) \| `null`; `nextRetryAt?`: `string` \| `null`; `resourceId`: [`SyncResourceId`](#syncresourceid); `schemaVersion`: `string` \| `null`; `scopeSignature`: `string` \| `null`; `status`: [`SyncLifecycleState`](#synclifecyclestate); `watermark`: `string` \| `null`; \} \| `null`

Defined in: [offline/sync/SyncCoordinator.ts:152](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/SyncCoordinator.ts#L152)

Returns a snapshot of the current state for a single resource,
or `null` if the resource ID is not registered.

###### Parameters

###### resourceId

[`SyncResourceId`](#syncresourceid)

###### Returns

\{ `consecutiveFailures`: `number`; `cooldownMs?`: `number` \| `null`; `lastAttemptAt?`: `string` \| `null`; `lastError`: `string` \| `null`; `lastSuccessHash`: `string` \| `null`; `lastSyncedAt`: `string` \| `null`; `lastTrigger?`: [`SyncTrigger`](#synctrigger) \| `null`; `nextRetryAt?`: `string` \| `null`; `resourceId`: [`SyncResourceId`](#syncresourceid); `schemaVersion`: `string` \| `null`; `scopeSignature`: `string` \| `null`; `status`: [`SyncLifecycleState`](#synclifecyclestate); `watermark`: `string` \| `null`; \} \| `null`

##### getResourceStates()

> **getResourceStates**(): `object`[]

Defined in: [offline/sync/SyncCoordinator.ts:160](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/SyncCoordinator.ts#L160)

Returns snapshots of the current state for all registered resources.

###### Returns

`object`[]

##### hydrateResourceStates()

> **hydrateResourceStates**(`states`): `void`

Defined in: [offline/sync/SyncCoordinator.ts:176](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/SyncCoordinator.ts#L176)

Replaces in-memory resource states with the supplied values, then emits a state-change
notification. Used to restore persisted state after a page reload.

###### Parameters

###### states

[`SyncResourceState`](#syncresourcestate)[]

###### Returns

`void`

##### runTrigger()

> **runTrigger**(`trigger`): `Promise`\<`void`\>

Defined in: [offline/sync/SyncCoordinator.ts:196](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/SyncCoordinator.ts#L196)

Runs all resources that subscribe to `trigger`, in priority order.
If a run for the same trigger is already in flight, returns the existing Promise
instead of starting a second one.

###### Parameters

###### trigger

[`SyncTrigger`](#synctrigger)

The event that initiated this sync pass.

###### Returns

`Promise`\<`void`\>

## Interfaces

### InvoiceOutboxEntry

Defined in: [offline/invoiceOutbox.ts:13](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L13)

#### Properties

##### acknowledged\_at

> **acknowledged\_at**: `string` \| `null`

Defined in: [offline/invoiceOutbox.ts:27](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L27)

##### client\_request\_id

> **client\_request\_id**: `string`

Defined in: [offline/invoiceOutbox.ts:15](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L15)

##### created\_at

> **created\_at**: `string`

Defined in: [offline/invoiceOutbox.ts:20](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L20)

##### data

> **data**: `AnyRecord`

Defined in: [offline/invoiceOutbox.ts:19](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L19)

##### invoice

> **invoice**: `AnyRecord`

Defined in: [offline/invoiceOutbox.ts:18](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L18)

##### invoice\_name

> **invoice\_name**: `string` \| `null`

Defined in: [offline/invoiceOutbox.ts:26](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L26)

##### last\_error

> **last\_error**: `string` \| `null`

Defined in: [offline/invoiceOutbox.ts:25](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L25)

##### next\_retry\_at

> **next\_retry\_at**: `string` \| `null`

Defined in: [offline/invoiceOutbox.ts:22](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L22)

##### nextAttemptAt?

> `optional` **nextAttemptAt?**: `string` \| `null`

Defined in: [offline/invoiceOutbox.ts:23](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L23)

##### outbox\_id?

> `optional` **outbox\_id?**: `number`

Defined in: [offline/invoiceOutbox.ts:14](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L14)

##### resource?

> `optional` **resource?**: `"invoice_outbox"`

Defined in: [offline/invoiceOutbox.ts:16](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L16)

##### retry\_count

> **retry\_count**: `number`

Defined in: [offline/invoiceOutbox.ts:24](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L24)

##### status

> **status**: [`InvoiceOutboxStatus`](#invoiceoutboxstatus)

Defined in: [offline/invoiceOutbox.ts:17](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L17)

##### updated\_at

> **updated\_at**: `string`

Defined in: [offline/invoiceOutbox.ts:21](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L21)

***

### OfflineQueueEntry

Defined in: [offline/writeQueue.ts:22](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L22)

#### Properties

##### created\_at

> **created\_at**: `string`

Defined in: [offline/writeQueue.ts:27](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L27)

##### entity\_type

> **entity\_type**: [`OfflineEntityType`](#offlineentitytype)

Defined in: [offline/writeQueue.ts:24](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L24)

##### idempotency\_key

> **idempotency\_key**: `string`

Defined in: [offline/writeQueue.ts:32](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L32)

##### last\_attempt\_at

> **last\_attempt\_at**: `string` \| `null`

Defined in: [offline/writeQueue.ts:28](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L28)

##### last\_error

> **last\_error**: `string` \| `null`

Defined in: [offline/writeQueue.ts:33](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L33)

##### next\_attempt\_at?

> `optional` **next\_attempt\_at?**: `string` \| `null`

Defined in: [offline/writeQueue.ts:29](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L29)

##### payload

> **payload**: `AnyRecord`

Defined in: [offline/writeQueue.ts:26](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L26)

##### queue\_id?

> `optional` **queue\_id?**: `number`

Defined in: [offline/writeQueue.ts:23](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L23)

##### resource?

> `optional` **resource?**: [`OfflineEntityType`](#offlineentitytype)

Defined in: [offline/writeQueue.ts:25](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L25)

##### retry\_count

> **retry\_count**: `number`

Defined in: [offline/writeQueue.ts:30](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L30)

##### status

> **status**: [`OfflineQueueStatus`](#offlinequeuestatus)

Defined in: [offline/writeQueue.ts:31](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L31)

***

### SyncResourceDefinition

Defined in: [offline/sync/types.ts:72](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L72)

Static definition of a single sync resource. Registered in `resourceRegistry.ts`
and consumed by `SyncCoordinator`.

#### Properties

##### fullResyncSupported

> **fullResyncSupported**: `boolean`

Defined in: [offline/sync/types.ts:88](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L88)

Whether the adapter supports full-resync (wiping and re-fetching all records).

##### id

> **id**: [`SyncResourceId`](#syncresourceid)

Defined in: [offline/sync/types.ts:74](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L74)

Unique identifier.

##### mode

> **mode**: [`SyncResourceMode`](#syncresourcemode)

Defined in: [offline/sync/types.ts:78](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L78)

Fetch strategy.

##### priority

> **priority**: [`SyncResourcePriority`](#syncresourcepriority)

Defined in: [offline/sync/types.ts:80](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L80)

Execution priority within a trigger run.

##### scope

> **scope**: `"customer"` \| `"company"` \| `"global"` \| `"profile"`

Defined in: [offline/sync/types.ts:76](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L76)

Data isolation boundary — determines the scope-signature used for cache invalidation.

##### storageKey

> **storageKey**: `string`

Defined in: [offline/sync/types.ts:84](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L84)

IndexedDB/localStorage key prefix used by the adapter.

##### triggers

> **triggers**: [`SyncTrigger`](#synctrigger)[]

Defined in: [offline/sync/types.ts:82](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L82)

Which triggers activate this resource.

##### ttlMs?

> `optional` **ttlMs?**: `number` \| `null`

Defined in: [offline/sync/types.ts:90](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L90)

Optional TTL in milliseconds. `null` means no expiry.

##### watermarkType

> **watermarkType**: `"none"` \| `"timestamp"` \| `"cursor"`

Defined in: [offline/sync/types.ts:86](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L86)

Watermark type used for delta syncs. `"none"` means full-resync every time.

***

### SyncResourceState

Defined in: [offline/sync/types.ts:103](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L103)

Runtime state of a single sync resource, persisted across page loads.
Returned by `SyncCoordinator.getResourceState()` and
`SyncCoordinator.getResourceStates()`.

Timestamp fields use ISO-8601 strings. `watermark` stores the next delta cursor
or timestamp, `lastSuccessHash` skips no-op writes, failure fields drive retry
backoff, `scopeSignature` detects profile/company changes, and `schemaVersion`
triggers full resyncs after data-model changes.

#### Properties

##### consecutiveFailures

> **consecutiveFailures**: `number`

Defined in: [offline/sync/types.ts:110](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L110)

##### cooldownMs?

> `optional` **cooldownMs?**: `number` \| `null`

Defined in: [offline/sync/types.ts:113](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L113)

##### lastAttemptAt?

> `optional` **lastAttemptAt?**: `string` \| `null`

Defined in: [offline/sync/types.ts:111](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L111)

##### lastError

> **lastError**: `string` \| `null`

Defined in: [offline/sync/types.ts:109](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L109)

##### lastSuccessHash

> **lastSuccessHash**: `string` \| `null`

Defined in: [offline/sync/types.ts:108](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L108)

##### lastSyncedAt

> **lastSyncedAt**: `string` \| `null`

Defined in: [offline/sync/types.ts:106](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L106)

##### lastTrigger?

> `optional` **lastTrigger?**: [`SyncTrigger`](#synctrigger) \| `null`

Defined in: [offline/sync/types.ts:114](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L114)

##### nextRetryAt?

> `optional` **nextRetryAt?**: `string` \| `null`

Defined in: [offline/sync/types.ts:112](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L112)

##### resourceId

> **resourceId**: [`SyncResourceId`](#syncresourceid)

Defined in: [offline/sync/types.ts:104](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L104)

##### schemaVersion

> **schemaVersion**: `string` \| `null`

Defined in: [offline/sync/types.ts:116](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L116)

##### scopeSignature

> **scopeSignature**: `string` \| `null`

Defined in: [offline/sync/types.ts:115](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L115)

##### status

> **status**: [`SyncLifecycleState`](#synclifecyclestate)

Defined in: [offline/sync/types.ts:105](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L105)

##### watermark

> **watermark**: `string` \| `null`

Defined in: [offline/sync/types.ts:107](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L107)

***

### SyncTriggerResourceSummary

Defined in: [offline/sync/types.ts:119](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L119)

#### Properties

##### error

> **error**: `string` \| `null`

Defined in: [offline/sync/types.ts:124](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L124)

##### priority

> **priority**: [`SyncResourcePriority`](#syncresourcepriority)

Defined in: [offline/sync/types.ts:121](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L121)

##### resourceId

> **resourceId**: [`SyncResourceId`](#syncresourceid)

Defined in: [offline/sync/types.ts:120](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L120)

##### skipped

> **skipped**: `boolean`

Defined in: [offline/sync/types.ts:123](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L123)

##### status

> **status**: [`SyncLifecycleState`](#synclifecyclestate)

Defined in: [offline/sync/types.ts:122](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L122)

***

### SyncTriggerRunSummary

Defined in: [offline/sync/types.ts:127](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L127)

#### Properties

##### bootCriticalFailures

> **bootCriticalFailures**: `number`

Defined in: [offline/sync/types.ts:135](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L135)

##### errors

> **errors**: `object`[]

Defined in: [offline/sync/types.ts:136](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L136)

###### message

> **message**: `string`

###### priority

> **priority**: [`SyncResourcePriority`](#syncresourcepriority)

###### resourceId

> **resourceId**: [`SyncResourceId`](#syncresourceid)

##### failed

> **failed**: `number`

Defined in: [offline/sync/types.ts:133](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L133)

##### finishedAt

> **finishedAt**: `string`

Defined in: [offline/sync/types.ts:130](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L130)

##### resources

> **resources**: [`SyncTriggerResourceSummary`](#synctriggerresourcesummary)[]

Defined in: [offline/sync/types.ts:141](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L141)

##### resourcesTotal

> **resourcesTotal**: `number`

Defined in: [offline/sync/types.ts:131](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L131)

##### skipped

> **skipped**: `number`

Defined in: [offline/sync/types.ts:134](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L134)

##### startedAt

> **startedAt**: `string`

Defined in: [offline/sync/types.ts:129](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L129)

##### succeeded

> **succeeded**: `number`

Defined in: [offline/sync/types.ts:132](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L132)

##### trigger

> **trigger**: [`SyncTrigger`](#synctrigger)

Defined in: [offline/sync/types.ts:128](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L128)

## Type Aliases

### InvoiceOutboxMode

> **InvoiceOutboxMode** = `"off"` \| `"dual_write"` \| `"coordinator"`

Defined in: [offline/invoiceOutbox.ts:5](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L5)

***

### InvoiceOutboxStatus

> **InvoiceOutboxStatus** = `"pending"` \| `"syncing"` \| `"retrying"` \| `"acknowledged"` \| `"dead_letter"`

Defined in: [offline/invoiceOutbox.ts:6](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/invoiceOutbox.ts#L6)

***

### OfflineEntityType

> **OfflineEntityType** = `"invoice"` \| `"customer"` \| `"payment"` \| `"cash_movement"`

Defined in: [offline/writeQueue.ts:9](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L9)

***

### OfflinePruneResult

> **OfflinePruneResult** = `object`

Defined in: [offline/db.ts:470](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L470)

#### Properties

##### invoiceOutbox

> **invoiceOutbox**: `number`

Defined in: [offline/db.ts:471](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L471)

##### localTelemetry

> **localTelemetry**: `number`

Defined in: [offline/db.ts:475](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L475)

##### syncState

> **syncState**: `number`

Defined in: [offline/db.ts:473](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L473)

##### tombstones

> **tombstones**: `number`

Defined in: [offline/db.ts:474](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L474)

##### writeQueue

> **writeQueue**: `number`

Defined in: [offline/db.ts:472](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L472)

***

### OfflineQueueStatus

> **OfflineQueueStatus** = `"pending"` \| `"syncing"` \| `"failed"` \| `"dead_letter"` \| `"synced"`

Defined in: [offline/writeQueue.ts:15](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/writeQueue.ts#L15)

***

### SyncLifecycleState

> **SyncLifecycleState** = `"idle"` \| `"syncing"` \| `"fresh"` \| `"stale"` \| `"error"` \| `"limited"`

Defined in: [offline/sync/types.ts:60](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L60)

Per-resource lifecycle state exposed to the UI:
- `"idle"` — not yet synced in this session.
- `"syncing"` — fetch in progress.
- `"fresh"` — successfully synced and within TTL.
- `"stale"` — synced but TTL has expired.
- `"error"` — last sync attempt failed.
- `"limited"` — partial data available (e.g. scope mismatch).

***

### SyncResourceId

> **SyncResourceId** = `"bootstrap_config"` \| `"price_list_meta"` \| `"currency_matrix"` \| `"payment_method_currencies"` \| `"item_groups"` \| `"offers"` \| `"items"` \| `"item_prices"` \| `"stock"` \| `"customers"` \| `"invoice_outbox"` \| `"customer_addresses"` \| `"delivery_charges"`

Defined in: [offline/sync/types.ts:5](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L5)

All registered offline-sync resource identifiers.
Each ID maps 1-to-1 with a [SyncResourceDefinition](#syncresourcedefinition) in the resource registry.

***

### SyncResourceMode

> **SyncResourceMode** = `"delta"` \| `"scoped"` \| `"on_demand"`

Defined in: [offline/sync/types.ts:26](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L26)

How a resource is synchronised from the server:
- `"delta"` — fetch only records changed since the last watermark.
- `"scoped"` — fetch all records whose scope (profile/company/customer) matches the current session.
- `"on_demand"` — fetched only when explicitly requested, not on a schedule.

***

### SyncResourcePriority

> **SyncResourcePriority** = `"boot_critical"` \| `"warm"` \| `"lazy"`

Defined in: [offline/sync/types.ts:34](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L34)

Controls the order in which resources are processed within a single trigger run:
- `"boot_critical"` — must succeed before the POS is usable offline.
- `"warm"` — important but not blocking; synced after boot-critical resources.
- `"lazy"` — can be deferred until the app is idle.

***

### SyncTrigger

> **SyncTrigger** = `"boot"` \| `"online_resume"` \| `"timer"` \| `"profile_change"` \| `"user_action"`

Defined in: [offline/sync/types.ts:44](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/sync/types.ts#L44)

Events that can kick off a sync run:
- `"boot"` — app startup.
- `"online_resume"` — network connection regained.
- `"timer"` — periodic background tick.
- `"profile_change"` — POS profile switched mid-session.
- `"user_action"` — explicit user-initiated refresh.

## Variables

### db

> `const` **db**: `any`

Defined in: [offline/db.ts:43](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L43)

***

### DERIVED\_OFFLINE\_CACHE\_KEYS

> `const` **DERIVED\_OFFLINE\_CACHE\_KEYS**: readonly `string`[]

Defined in: [offline/db.ts:132](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L132)

***

### initPromise

> `const` **initPromise**: `Promise`\<`void`\>

Defined in: [offline/db.ts:362](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L362)

***

### KEY\_TABLE\_MAP

> `const` **KEY\_TABLE\_MAP**: `Record`\<`string`, `string`\>

Defined in: [offline/db.ts:67](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L67)

***

### memory

> `const` **memory**: `AnyRecord`

Defined in: [offline/db.ts:294](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L294)

***

### memoryInitPromise

> `const` **memoryInitPromise**: `Promise`\<`void`\> = `initPromise`

Defined in: [offline/index.ts:46](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/index.ts#L46)

***

### PENDING\_OFFLINE\_QUEUE\_KEYS

> `const` **PENDING\_OFFLINE\_QUEUE\_KEYS**: readonly `string`[]

Defined in: [offline/db.ts:125](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/db.ts#L125)

***

### setTaxTemplate

> `const` **setTaxTemplate**: (`name`, `doc`) => `void` = `saveTaxTemplate`

Defined in: [offline/cache.ts:838](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/offline/cache.ts#L838)

#### Parameters

##### name

`any`

##### doc

`any`

#### Returns

`void`
