[**posawesome-frontend**](README.md)

***

[posawesome-frontend](README.md) / offline

# offline

## Functions

### beginItemCatalogGeneration()

> **beginItemCatalogGeneration**(`scope`): `Promise`\<\{ `generation`: `string`; `scope`: `string`; \}\>

Defined in: [offline/cache.ts:447](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L447)

#### Parameters

##### scope

`string`

#### Returns

`Promise`\<\{ `generation`: `string`; `scope`: `string`; \}\>

***

### buildSyncStateStorageKey()

> **buildSyncStateStorageKey**(`resourceId`): `string`

Defined in: [offline/sync/syncState.ts:11](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/syncState.ts#L11)

#### Parameters

##### resourceId

[`SyncResourceId`](#syncresourceid)

#### Returns

`string`

***

### checkDbHealth()

> **checkDbHealth**(): `Promise`\<`boolean`\>

Defined in: [offline/db.ts:1541](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1541)

#### Returns

`Promise`\<`boolean`\>

***

### claimRetryableQueueEntries()

> **claimRetryableQueueEntries**(`entityType`): `Promise`\<[`OfflineQueueEntry`](#offlinequeueentry)[]\>

Defined in: [offline/writeQueue.ts:443](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L443)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

#### Returns

`Promise`\<[`OfflineQueueEntry`](#offlinequeueentry)[]\>

***

### clearAllCache()

> **clearAllCache**(): `Promise`\<`void`\>

Defined in: [offline/db.ts:1328](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1328)

#### Returns

`Promise`\<`void`\>

***

### clearCoupons()

> **clearCoupons**(): `void`

Defined in: [offline/cache.ts:1945](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1945)

#### Returns

`void`

***

### clearCustomerBalanceCache()

> **clearCustomerBalanceCache**(): `void`

Defined in: [offline/customers.ts:469](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L469)

#### Returns

`void`

***

### clearCustomerStorage()

> **clearCustomerStorage**(): `Promise`\<`void`\>

Defined in: [offline/cache.ts:1796](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1796)

#### Returns

`Promise`\<`void`\>

***

### clearDerivedOfflineCaches()

> **clearDerivedOfflineCaches**(): `Promise`\<`void`\>

Defined in: [offline/db.ts:1394](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1394)

#### Returns

`Promise`\<`void`\>

***

### clearExpiredCustomerBalances()

> **clearExpiredCustomerBalances**(): `void`

Defined in: [offline/customers.ts:478](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L478)

#### Returns

`void`

***

### clearGiftCardSnapshotCache()

> **clearGiftCardSnapshotCache**(): `void`

Defined in: [offline/customers.ts:425](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L425)

#### Returns

`void`

***

### clearItemDetailsCache()

> **clearItemDetailsCache**(): `void`

Defined in: [offline/cache.ts:1437](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1437)

#### Returns

`void`

***

### clearItemGroups()

> **clearItemGroups**(): `void`

Defined in: [offline/cache.ts:1970](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1970)

#### Returns

`void`

***

### clearLocalStockCache()

> **clearLocalStockCache**(): `void`

Defined in: [offline/stock.ts:181](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/stock.ts#L181)

#### Returns

`void`

***

### clearOfflineCashMovements()

> **clearOfflineCashMovements**(): `Promise`\<`void`\>

Defined in: [offline/cash\_movements.ts:39](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cash_movements.ts#L39)

#### Returns

`Promise`\<`void`\>

***

### clearOfflineCustomers()

> **clearOfflineCustomers**(): `Promise`\<`void`\>

Defined in: [offline/customers.ts:63](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L63)

#### Returns

`Promise`\<`void`\>

***

### clearOfflineInvoices()

> **clearOfflineInvoices**(): `Promise`\<`void`\>

Defined in: [offline/invoices.ts:238](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoices.ts#L238)

#### Returns

`Promise`\<`void`\>

***

### clearOfflinePayments()

> **clearOfflinePayments**(): `Promise`\<`void`\>

Defined in: [offline/payments.ts:55](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/payments.ts#L55)

#### Returns

`Promise`\<`void`\>

***

### clearOpeningStorage()

> **clearOpeningStorage**(): `void`

Defined in: [offline/cache.ts:1681](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1681)

#### Returns

`void`

***

### clearPriceListCache()

> **clearPriceListCache**(): `void`

Defined in: [offline/cache.ts:1124](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1124)

#### Returns

`void`

***

### clearPricingRulesSnapshot()

> **clearPricingRulesSnapshot**(): `void`

Defined in: [offline/cache.ts:1851](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1851)

#### Returns

`void`

***

### clearStoredItems()

> **clearStoredItems**(`scope?`): `Promise`\<`void`\>

Defined in: [offline/cache.ts:909](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L909)

#### Parameters

##### scope?

`string` = `""`

#### Returns

`Promise`\<`void`\>

***

### clearStoredValueSnapshotCache()

> **clearStoredValueSnapshotCache**(): `void`

Defined in: [offline/customers.ts:374](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L374)

#### Returns

`void`

***

### clearSyncResourceState()

> **clearSyncResourceState**(`resourceId`): `Promise`\<`void`\>

Defined in: [offline/sync/syncState.ts:96](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/syncState.ts#L96)

#### Parameters

##### resourceId

[`SyncResourceId`](#syncresourceid)

#### Returns

`Promise`\<`void`\>

***

### clearWriteQueueEntries()

> **clearWriteQueueEntries**(`entityType`, `options?`): `Promise`\<`void`\>

Defined in: [offline/writeQueue.ts:422](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L422)

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

Defined in: [offline/sync/SyncCoordinator.ts:467](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/SyncCoordinator.ts#L467)

Creates a [SyncCoordinator](#synccoordinator) pre-loaded with the full default resource registry.
This is the standard factory used by `useSyncCoordinator` at app startup.

#### Returns

[`SyncCoordinator`](#synccoordinator)

***

### deleteCustomerStorageByNames()

> **deleteCustomerStorageByNames**(`names`): `Promise`\<`void`\>

Defined in: [offline/customers.ts:293](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L293)

#### Parameters

##### names

`string`[]

#### Returns

`Promise`\<`void`\>

***

### deleteOfflineCashMovement()

> **deleteOfflineCashMovement**(`index`): `Promise`\<`void`\>

Defined in: [offline/cash\_movements.ts:43](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cash_movements.ts#L43)

#### Parameters

##### index

`number`

#### Returns

`Promise`\<`void`\>

***

### deleteOfflineCustomer()

> **deleteOfflineCustomer**(`index`): `Promise`\<`void`\>

Defined in: [offline/customers.ts:67](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L67)

#### Parameters

##### index

`number`

#### Returns

`Promise`\<`void`\>

***

### deleteOfflineInvoice()

> **deleteOfflineInvoice**(`index`): `Promise`\<`void`\>

Defined in: [offline/invoices.ts:242](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoices.ts#L242)

#### Parameters

##### index

`number`

#### Returns

`Promise`\<`void`\>

***

### deleteOfflinePayment()

> **deleteOfflinePayment**(`index`): `Promise`\<`void`\>

Defined in: [offline/payments.ts:59](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/payments.ts#L59)

#### Parameters

##### index

`number`

#### Returns

`Promise`\<`void`\>

***

### deleteStoredItemsByCodes()

> **deleteStoredItemsByCodes**(`itemCodes?`, `scope?`): `Promise`\<`void`\>

Defined in: [offline/cache.ts:988](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L988)

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

Defined in: [offline/writeQueue.ts:401](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L401)

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

Defined in: [offline/writeQueue.ts:410](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L410)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

##### index

`number`

#### Returns

`Promise`\<`void`\>

***

### deriveItemSearchFields()

> **deriveItemSearchFields**(`item`): `object`

Defined in: [offline/cache.ts:118](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L118)

#### Parameters

##### item

`SearchableItem` \| `null` \| `undefined`

#### Returns

`object`

##### barcodes

> **barcodes**: `string`[]

##### barcodes\_lc

> **barcodes\_lc**: `string`[] = `barcodesLc`

##### batch\_no\_data?

> `optional` **batch\_no\_data?**: `ItemBatchEntry`[] \| `null`

##### batches

> **batches**: `string`[]

##### item\_barcode?

> `optional` **item\_barcode?**: `string` \| `ItemBarcodeEntry`[] \| `null`

##### item\_code?

> `optional` **item\_code?**: `string` \| `null`

##### item\_code\_lc

> **item\_code\_lc**: `string` = `itemCodeLc`

##### item\_name?

> `optional` **item\_name?**: `string` \| `null`

##### item\_name\_lc

> **item\_name\_lc**: `string` = `itemNameLc`

##### name\_keywords

> **name\_keywords**: `string`[] = `nameKeywords`

##### name\_keywords\_lc

> **name\_keywords\_lc**: `string`[] = `nameKeywordsLc`

##### search\_text

> **search\_text**: `string`

##### serial\_no\_data?

> `optional` **serial\_no\_data?**: `ItemSerialEntry`[] \| `null`

##### serials

> **serials**: `string`[]

***

### discardItemCatalogGeneration()

> **discardItemCatalogGeneration**(`scope`, `generation`): `Promise`\<`void`\>

Defined in: [offline/cache.ts:527](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L527)

#### Parameters

##### scope

`string`

##### generation

`string`

#### Returns

`Promise`\<`void`\>

***

### enqueueInvoiceOutboxEntry()

> **enqueueInvoiceOutboxEntry**(`entry`): `Promise`\<`any`\>

Defined in: [offline/invoiceOutbox.ts:145](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L145)

#### Parameters

##### entry

`AnyRecord`

#### Returns

`Promise`\<`any`\>

***

### enqueueWriteQueueEntry()

> **enqueueWriteQueueEntry**(`entityType`, `payload`, `options?`): `Promise`\<`any`\>

Defined in: [offline/writeQueue.ts:392](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L392)

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

Defined in: [offline/writeQueue.ts:666](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L666)

#### Returns

`Promise`\<`void`\>

***

### exportOfflineRecoveryData()

> **exportOfflineRecoveryData**(): `Promise`\<\{ `database`: `any`; `exportedAt`: `string`; `invoiceIntentJournal`: `Record`\<`string`, `unknown`\>; `invoiceOutbox`: `any`; `legacyQueue`: `any`; `version`: `any`; `writeQueue`: `any`; \}\>

Defined in: [offline/db.ts:1502](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1502)

#### Returns

`Promise`\<\{ `database`: `any`; `exportedAt`: `string`; `invoiceIntentJournal`: `Record`\<`string`, `unknown`\>; `invoiceOutbox`: `any`; `legacyQueue`: `any`; `version`: `any`; `writeQueue`: `any`; \}\>

***

### fetchItemStockQuantities()

> **fetchItemStockQuantities**(`items`, `pos_profile`, `chunkSize?`): `Promise`\<`AnyRecord`[] \| `null`\>

Defined in: [offline/stock.ts:6](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/stock.ts#L6)

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

### flushPersistQueue()

> **flushPersistQueue**(): `Promise`\<`void`\>

Defined in: [offline/db.ts:1032](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1032)

#### Returns

`Promise`\<`void`\>

***

### forceClearAllCache()

> **forceClearAllCache**(): `Promise`\<`void`\>

Defined in: [offline/db.ts:1378](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1378)

#### Returns

`Promise`\<`void`\>

***

### getActiveItemCatalogGeneration()

> **getActiveItemCatalogGeneration**(`scope`): `Promise`\<`string` \| `null`\>

Defined in: [offline/cache.ts:354](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L354)

#### Parameters

##### scope

`string`

#### Returns

`Promise`\<`string` \| `null`\>

***

### getAllStoredItems()

> **getAllStoredItems**(`scope?`): `Promise`\<`any`\>

Defined in: [offline/cache.ts:801](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L801)

#### Parameters

##### scope?

`string` = `""`

#### Returns

`Promise`\<`any`\>

***

### getBootstrapLimitedMode()

> **getBootstrapLimitedMode**(): `boolean`

Defined in: [offline/cache.ts:1601](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1601)

#### Returns

`boolean`

***

### getBootstrapSnapshot()

> **getBootstrapSnapshot**(): `any`

Defined in: [offline/cache.ts:1540](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1540)

#### Returns

`any`

***

### getBootstrapSnapshotStatus()

> **getBootstrapSnapshotStatus**(): `any`

Defined in: [offline/cache.ts:1586](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1586)

#### Returns

`any`

***

### getCachedCoupons()

> **getCachedCoupons**(): `any`

Defined in: [offline/cache.ts:1941](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1941)

#### Returns

`any`

***

### getCachedCurrencyOptions()

> **getCachedCurrencyOptions**(`profileName`, `ttlMs?`): `any`

Defined in: [offline/cache.ts:2052](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L2052)

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

Defined in: [offline/cache.ts:2182](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L2182)

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

Defined in: [offline/customers.ts:453](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L453)

#### Parameters

##### customer

`string`

#### Returns

`any`

***

### getCachedDeliveryCharges()

> **getCachedDeliveryCharges**(`profileName`, `customer`, `ttlMs?`): `any`

Defined in: [offline/cache.ts:2011](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L2011)

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

Defined in: [offline/cache.ts:2097](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L2097)

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

Defined in: [offline/customers.ts:406](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L406)

#### Parameters

##### giftCardCode

`string`

#### Returns

`any`

***

### getCachedItemDetails()

> **getCachedItemDetails**(`profileName`, `priceList`, `itemCodes`, `ttl?`): `Promise`\<\{ `cached`: `any`[]; `missing`: `string`[]; \}\>

Defined in: [offline/cache.ts:1393](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1393)

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

Defined in: [offline/cache.ts:1966](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1966)

#### Returns

`any`

***

### getCachedItemPriceForUom()

> **getCachedItemPriceForUom**(`__namedParameters`): `Promise`\<[`OfflineItemPriceRecord`](#offlineitempricerecord) \| `null`\>

Defined in: [offline/cache.ts:1094](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1094)

#### Parameters

##### \_\_namedParameters

###### currency?

`string` \| `null` = `null`

###### customer?

`string` \| `null` = `null`

###### date?

`string` \| `null` = `null`

###### itemCode

`string`

###### priceList

`string`

###### uom

`string`

#### Returns

`Promise`\<[`OfflineItemPriceRecord`](#offlineitempricerecord) \| `null`\>

***

### getCachedOffers()

> **getCachedOffers**(): `any`

Defined in: [offline/cache.ts:1048](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1048)

#### Returns

`any`

***

### getCachedPaymentMethodCurrencyMap()

> **getCachedPaymentMethodCurrencyMap**(`company`, `ttlMs?`): `any`

Defined in: [offline/cache.ts:2222](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L2222)

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

Defined in: [offline/cache.ts:1078](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1078)

#### Parameters

##### priceList

`any`

#### Returns

`any`

***

### getCachedPriceListMeta()

> **getCachedPriceListMeta**(`profileName`, `ttlMs?`): `any`

Defined in: [offline/cache.ts:2142](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L2142)

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

Defined in: [offline/cache.ts:1840](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1840)

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

Defined in: [offline/customers.ts:354](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L354)

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

Defined in: [offline/cache.ts:2239](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L2239)

#### Returns

`Promise`\<\{ `indexedDB`: `number`; `localStorage`: `number`; `percentage`: `number`; `total`: `number`; \}\>

***

### getCustomersLastSync()

> **getCustomersLastSync**(): `any`

Defined in: [offline/cache.ts:1782](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1782)

#### Returns

`any`

***

### getCustomerStorage()

> **getCustomerStorage**(): `any`

Defined in: [offline/customers.ts:133](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L133)

#### Returns

`any`

***

### getCustomerStorageCount()

> **getCustomerStorageCount**(): `Promise`\<`any`\>

Defined in: [offline/cache.ts:1786](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1786)

#### Returns

`Promise`\<`any`\>

***

### getInvoiceOutboxMode()

> **getInvoiceOutboxMode**(): [`InvoiceOutboxMode`](#invoiceoutboxmode)

Defined in: [offline/invoiceOutbox.ts:75](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L75)

#### Returns

[`InvoiceOutboxMode`](#invoiceoutboxmode)

***

### getInvoiceOutboxRows()

> **getInvoiceOutboxRows**(`options?`): `Promise`\<[`InvoiceOutboxEntry`](#invoiceoutboxentry)[]\>

Defined in: [offline/invoiceOutbox.ts:191](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L191)

#### Parameters

##### options?

###### includeTerminal?

`boolean`

#### Returns

`Promise`\<[`InvoiceOutboxEntry`](#invoiceoutboxentry)[]\>

***

### getItemsLastSync()

> **getItemsLastSync**(): `any`

Defined in: [offline/cache.ts:1773](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1773)

#### Returns

`any`

***

### getItemUOMs()

> **getItemUOMs**(`itemCode`): `any`

Defined in: [offline/cache.ts:967](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L967)

#### Parameters

##### itemCode

`any`

#### Returns

`any`

***

### getLastSyncTotals()

> **getLastSyncTotals**(): `any`

Defined in: [offline/invoices.ts:267](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoices.ts#L267)

#### Returns

`any`

***

### getLocalStock()

> **getLocalStock**(`itemCode`): `any`

Defined in: [offline/stock.ts:150](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/stock.ts#L150)

#### Parameters

##### itemCode

`string`

#### Returns

`any`

***

### getLocalStockCache()

> **getLocalStockCache**(): `any`

Defined in: [offline/stock.ts:254](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/stock.ts#L254)

#### Returns

`any`

***

### getOfflineCashMovements()

> **getOfflineCashMovements**(): `any`[]

Defined in: [offline/cash\_movements.ts:35](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cash_movements.ts#L35)

#### Returns

`any`[]

***

### getOfflineCustomers()

> **getOfflineCustomers**(): `any`[]

Defined in: [offline/customers.ts:59](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L59)

#### Returns

`any`[]

***

### getOfflineInvoices()

> **getOfflineInvoices**(): `any`[]

Defined in: [offline/invoices.ts:234](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoices.ts#L234)

#### Returns

`any`[]

***

### getOfflinePayments()

> **getOfflinePayments**(): `any`[]

Defined in: [offline/payments.ts:51](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/payments.ts#L51)

#### Returns

`any`[]

***

### getOfflineStorageDiagnostics()

> **getOfflineStorageDiagnostics**(): `Promise`\<\{ `database`: `any`; `quota`: `number` \| `null`; `tableCounts`: \{\[`k`: `string`\]: `any`; \}; `usage`: `number` \| `null`; `version`: `any`; \}\>

Defined in: [offline/db.ts:1471](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1471)

#### Returns

`Promise`\<\{ `database`: `any`; `quota`: `number` \| `null`; `tableCounts`: \{\[`k`: `string`\]: `any`; \}; `usage`: `number` \| `null`; `version`: `any`; \}\>

***

### getOpeningDialogStorage()

> **getOpeningDialogStorage**(): `any`

Defined in: [offline/cache.ts:1694](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1694)

#### Returns

`any`

***

### getOpeningStorage()

> **getOpeningStorage**(): `any`

Defined in: [offline/cache.ts:1536](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1536)

#### Returns

`any`

***

### getPendingInvoiceOutboxCount()

> **getPendingInvoiceOutboxCount**(): `Promise`\<`number`\>

Defined in: [offline/invoiceOutbox.ts:204](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L204)

#### Returns

`Promise`\<`number`\>

***

### getPendingOfflineCashMovementCount()

> **getPendingOfflineCashMovementCount**(): `any`

Defined in: [offline/cash\_movements.ts:47](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cash_movements.ts#L47)

#### Returns

`any`

***

### getPendingOfflineCustomerCount()

> **getPendingOfflineCustomerCount**(): `any`

Defined in: [offline/customers.ts:71](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L71)

#### Returns

`any`

***

### getPendingOfflineInvoiceCount()

> **getPendingOfflineInvoiceCount**(): `any`

Defined in: [offline/invoices.ts:246](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoices.ts#L246)

#### Returns

`any`

***

### getPendingOfflinePaymentCount()

> **getPendingOfflinePaymentCount**(): `any`

Defined in: [offline/payments.ts:63](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/payments.ts#L63)

#### Returns

`any`

***

### getPrintTemplate()

> **getPrintTemplate**(): `any`

Defined in: [offline/cache.ts:1888](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1888)

#### Returns

`any`

***

### getQueuedPayloadCount()

> **getQueuedPayloadCount**(`entityType`): `any`

Defined in: [offline/writeQueue.ts:688](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L688)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

#### Returns

`any`

***

### getQueuedPayloadSnapshots()

> **getQueuedPayloadSnapshots**(`entityType`): `any`[]

Defined in: [offline/writeQueue.ts:681](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L681)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

#### Returns

`any`[]

***

### getQueueEntries()

> **getQueueEntries**(`entityType`, `options?`): `Promise`\<[`OfflineQueueEntry`](#offlinequeueentry)[]\>

Defined in: [offline/writeQueue.ts:303](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L303)

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

Defined in: [offline/cache.ts:1520](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1520)

#### Returns

`any`

***

### getStoredCustomer()

> **getStoredCustomer**(`customerName`): `Promise`\<`any`\>

Defined in: [offline/customers.ts:162](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L162)

#### Parameters

##### customerName

`string`

#### Returns

`Promise`\<`any`\>

***

### ~~getStoredItems()~~

> **getStoredItems**(): `Promise`\<`any`\>

Defined in: [offline/cache.ts:707](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L707)

#### Returns

`Promise`\<`any`\>

#### Deprecated

Avoid unscoped reads. Prefer `getAllStoredItems(scope)` with an explicit scope.

***

### getStoredItemsCount()

> **getStoredItemsCount**(): `Promise`\<`any`\>

Defined in: [offline/cache.ts:773](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L773)

#### Returns

`Promise`\<`any`\>

***

### getStoredItemsCountByScope()

> **getStoredItemsCountByScope**(`scope?`): `Promise`\<`any`\>

Defined in: [offline/cache.ts:784](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L784)

#### Parameters

##### scope?

`string` = `""`

#### Returns

`Promise`\<`any`\>

***

### getSyncResourceDefinitions()

> **getSyncResourceDefinitions**(): [`SyncResourceDefinition`](#syncresourcedefinition)[]

Defined in: [offline/sync/resourceRegistry.ts:204](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/resourceRegistry.ts#L204)

Returns a shallow copy of all resource definitions with cloned `triggers` arrays.
Callers receive mutable copies so that the frozen registry cannot be accidentally mutated.

#### Returns

[`SyncResourceDefinition`](#syncresourcedefinition)[]

***

### getSyncResourcesByPriority()

> **getSyncResourcesByPriority**(`priority`): [`SyncResourceDefinition`](#syncresourcedefinition)[]

Defined in: [offline/sync/resourceRegistry.ts:216](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/resourceRegistry.ts#L216)

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

Defined in: [offline/sync/resourceRegistry.ts:229](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/resourceRegistry.ts#L229)

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

Defined in: [offline/sync/syncState.ts:74](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/syncState.ts#L74)

#### Parameters

##### resourceId

[`SyncResourceId`](#syncresourceid)

#### Returns

`Promise`\<[`SyncResourceState`](#syncresourcestate) \| `null`\>

***

### getTaxInclusiveSetting()

> **getTaxInclusiveSetting**(): `boolean`

Defined in: [offline/cache.ts:1707](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1707)

#### Returns

`boolean`

***

### getTaxTemplate()

> **getTaxTemplate**(`name`): `any`

Defined in: [offline/cache.ts:1510](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1510)

#### Parameters

##### name

`any`

#### Returns

`any`

***

### getTermsAndConditions()

> **getTermsAndConditions**(): `any`

Defined in: [offline/cache.ts:1908](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1908)

#### Returns

`any`

***

### getTranslationsCache()

> **getTranslationsCache**(`lang`): `any`

Defined in: [offline/cache.ts:1867](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1867)

#### Parameters

##### lang

`any`

#### Returns

`any`

***

### hydrateMemoryKeys()

> **hydrateMemoryKeys**(`keys`): `Promise`\<`void`\>

Defined in: [offline/db.ts:530](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L530)

#### Parameters

##### keys

readonly `string`[]

#### Returns

`Promise`\<`void`\>

***

### initializeStockCache()

> **initializeStockCache**(`items`, `pos_profile`): `Promise`\<`boolean`\>

Defined in: [offline/stock.ts:48](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/stock.ts#L48)

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

Defined in: [offline/db.ts:1315](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1315)

#### Returns

`any`

***

### isOffline()

> **isOffline**(): `any`

Defined in: [offline/db.ts:1283](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1283)

#### Returns

`any`

***

### isStockCacheReady()

> **isStockCacheReady**(): `any`

Defined in: [offline/stock.ts:109](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/stock.ts#L109)

#### Returns

`any`

***

### listSyncResourceStates()

> **listSyncResourceStates**(): `Promise`\<[`SyncResourceState`](#syncresourcestate)[]\>

Defined in: [offline/sync/syncState.ts:87](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/syncState.ts#L87)

#### Returns

`Promise`\<[`SyncResourceState`](#syncresourcestate)[]\>

***

### markWriteQueueEntryFailed()

> **markWriteQueueEntryFailed**(`entityType`, `queueId`, `error`, `expectedLastAttemptAt`): `Promise`\<`any`\>

Defined in: [offline/writeQueue.ts:584](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L584)

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

Defined in: [offline/writeQueue.ts:521](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L521)

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

### markWriteQueueEntrySyncedByIdempotencyKey()

> **markWriteQueueEntrySyncedByIdempotencyKey**(`entityType`, `idempotencyKey`): `Promise`\<`any`\>

Defined in: [offline/writeQueue.ts:543](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L543)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

##### idempotencyKey

`string`

#### Returns

`Promise`\<`any`\>

***

### mergeCachedPriceListItems()

> **mergeCachedPriceListItems**(`priceList`, `items?`): `void`

Defined in: [offline/cache.ts:1133](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1133)

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

Defined in: [offline/writeQueue.ts:644](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L644)

#### Returns

`Promise`\<`void`\>

***

### persist()

> **persist**(`key`, `value?`): `void`

Defined in: [offline/db.ts:1267](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1267)

#### Parameters

##### key

`string`

##### value?

`unknown` = `...`

#### Returns

`void`

***

### persistInvoiceIntentJournal()

> **persistInvoiceIntentJournal**(`entry`): `string`

Defined in: [offline/invoiceOutbox.ts:102](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L102)

#### Parameters

##### entry

`AnyRecord`

#### Returns

`string`

***

### promoteItemCatalogGeneration()

> **promoteItemCatalogGeneration**(`scope`, `generation`, `options?`): `Promise`\<\{ `generation`: `string`; `previousGeneration`: `string`; `rowCount`: `number`; \}\>

Defined in: [offline/cache.ts:558](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L558)

#### Parameters

##### scope

`string`

##### generation

`string`

##### options?

###### allowEmpty?

`boolean`

###### expectedCount?

`number`

#### Returns

`Promise`\<\{ `generation`: `string`; `previousGeneration`: `string`; `rowCount`: `number`; \}\>

***

### pruneOfflineStorage()

> **pruneOfflineStorage**(`options?`): `Promise`\<[`OfflinePruneResult`](#offlinepruneresult)\>

Defined in: [offline/db.ts:1221](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1221)

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

> **purgeOldQueueEntries**(`options?`): `number`

Defined in: [offline/db.ts:1596](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1596)

#### Parameters

##### options?

###### maxAgeDays?

`number`

###### now?

`number`

#### Returns

`number`

***

### queueHealthCheck()

> **queueHealthCheck**(): `boolean`

Defined in: [offline/db.ts:1549](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1549)

#### Returns

`boolean`

***

### quickDbHealthCheck()

> **quickDbHealthCheck**(): `Promise`\<`boolean`\>

Defined in: [offline/db.ts:1435](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1435)

#### Returns

`Promise`\<`boolean`\>

***

### reduceCacheUsage()

> **reduceCacheUsage**(): `void`

Defined in: [offline/cache.ts:1730](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1730)

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

Defined in: [offline/writeQueue.ts:336](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L336)

#### Returns

`Promise`\<`void`\>

***

### refreshBootstrapSnapshotFromCacheState()

> **refreshBootstrapSnapshotFromCacheState**(`cacheState?`): `void`

Defined in: [offline/cache.ts:1558](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1558)

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

Defined in: [offline/writeQueue.ts:329](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L329)

#### Parameters

##### entityType

[`OfflineEntityType`](#offlineentitytype)

#### Returns

`Promise`\<`void`\>

***

### registerPostHydrationTask()

> **registerPostHydrationTask**(`task`): () => `boolean`

Defined in: [offline/db.ts:648](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L648)

#### Parameters

##### task

`PostHydrationTask`

#### Returns

() => `boolean`

***

### removeCachedPriceListItems()

> **removeCachedPriceListItems**(`itemCodes?`, `priceList?`): `void`

Defined in: [offline/cache.ts:1176](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1176)

#### Parameters

##### itemCodes?

`string`[] = `[]`

##### priceList?

`string` \| `null`

#### Returns

`void`

***

### removeInvoiceIntentJournal()

> **removeInvoiceIntentJournal**(`clientRequestId`): `void`

Defined in: [offline/invoiceOutbox.ts:117](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L117)

#### Parameters

##### clientRequestId

`string`

#### Returns

`void`

***

### removeInvoiceOutboxEntry()

> **removeInvoiceOutboxEntry**(`clientRequestId`): `Promise`\<`any`\>

Defined in: [offline/invoiceOutbox.ts:208](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L208)

#### Parameters

##### clientRequestId

`string`

#### Returns

`Promise`\<`any`\>

***

### removeItemDetailsCacheEntries()

> **removeItemDetailsCacheEntries**(`profileName`, `itemCodes?`, `priceList?`): `void`

Defined in: [offline/cache.ts:1446](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1446)

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

Defined in: [offline/stock.ts:187](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/stock.ts#L187)

#### Parameters

##### itemCodes

`string`[]

#### Returns

`void`

***

### repairDbAfterFailedHealthCheck()

> **repairDbAfterFailedHealthCheck**(`error?`): `Promise`\<`boolean`\>

Defined in: [offline/db.ts:1448](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1448)

#### Parameters

##### error?

`unknown`

#### Returns

`Promise`\<`boolean`\>

***

### resetOfflineState()

> **resetOfflineState**(): `void`

Defined in: [offline/invoices.ts:250](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoices.ts#L250)

#### Returns

`void`

***

### resetSyncCoordinatorForTests()

> **resetSyncCoordinatorForTests**(): `void`

Defined in: [offline/sync/useSyncCoordinator.ts:15](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/useSyncCoordinator.ts#L15)

#### Returns

`void`

***

### safeBulkDelete()

> **safeBulkDelete**(`tableName`, `keys`): `Promise`\<`void`\>

Defined in: [offline/db.ts:1040](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1040)

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

Defined in: [offline/db.ts:718](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L718)

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

Defined in: [offline/cache.ts:1929](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1929)

#### Parameters

##### coupons

`any`

#### Returns

`void`

***

### saveCurrencyOptionsCache()

> **saveCurrencyOptionsCache**(`profileName`, `currencies`): `void`

Defined in: [offline/cache.ts:2029](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L2029)

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

Defined in: [offline/cache.ts:2159](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L2159)

#### Parameters

##### customer

`any`

##### addresses

`any`

#### Returns

`void`

***

### saveCustomerBalance()

> **saveCustomerBalance**(`customer`, `balance`, `currency?`): `void`

Defined in: [offline/customers.ts:434](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L434)

#### Parameters

##### customer

`string`

##### balance

`number`

##### currency?

`string`

#### Returns

`void`

***

### saveDeliveryChargesCache()

> **saveDeliveryChargesCache**(`profileName`, `customer`, `deliveryCharges`): `void`

Defined in: [offline/cache.ts:1984](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1984)

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

Defined in: [offline/cache.ts:2069](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L2069)

#### Parameters

##### entry?

`ExchangeRateCacheEntry` = `{}`

#### Returns

`void`

***

### saveGiftCardSnapshot()

> **saveGiftCardSnapshot**(`giftCardCode`, `snapshot`): `void`

Defined in: [offline/customers.ts:383](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L383)

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

Defined in: [offline/cache.ts:1217](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1217)

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

Defined in: [offline/cache.ts:1954](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1954)

#### Parameters

##### groups

`any`

#### Returns

`void`

***

### saveItems()

> **saveItems**(`items`, `scope?`): `Promise`\<`void`\>

Defined in: [offline/cache.ts:824](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L824)

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

Defined in: [offline/cache.ts:820](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L820)

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

Defined in: [offline/cache.ts:955](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L955)

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

Defined in: [offline/cache.ts:976](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L976)

#### Parameters

##### offers

`any`

#### Returns

`void`

***

### saveOfflineCashMovement()

> **saveOfflineCashMovement**(`entry`): `Promise`\<`any`\>

Defined in: [offline/cash\_movements.ts:23](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cash_movements.ts#L23)

#### Parameters

##### entry

`AnyRecord`

#### Returns

`Promise`\<`any`\>

***

### saveOfflineCustomer()

> **saveOfflineCustomer**(`entry`): `Promise`\<`any`\>

Defined in: [offline/customers.ts:25](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L25)

#### Parameters

##### entry

`AnyRecord`

#### Returns

`Promise`\<`any`\>

***

### saveOfflineInvoice()

> **saveOfflineInvoice**(`entry`): `Promise`\<`any`\>

Defined in: [offline/invoices.ts:214](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoices.ts#L214)

#### Parameters

##### entry

`AnyRecord`

#### Returns

`Promise`\<`any`\>

***

### saveOfflinePayment()

> **saveOfflinePayment**(`entry`): `Promise`\<`any`\>

Defined in: [offline/payments.ts:41](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/payments.ts#L41)

#### Parameters

##### entry

`AnyRecord`

#### Returns

`Promise`\<`any`\>

***

### savePaymentMethodCurrencyCache()

> **savePaymentMethodCurrencyCache**(`company`, `mapping`): `void`

Defined in: [offline/cache.ts:2199](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L2199)

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

Defined in: [offline/cache.ts:1056](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1056)

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

Defined in: [offline/cache.ts:2120](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L2120)

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

Defined in: [offline/cache.ts:1820](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1820)

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

Defined in: [offline/customers.ts:322](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L322)

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

Defined in: [offline/cache.ts:1496](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1496)

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

Defined in: [offline/cache.ts:1877](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1877)

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

Defined in: [offline/db.ts:1250](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1250)

#### Returns

`void`

***

### searchStoredItems()

> **searchStoredItems**(`__namedParameters?`): `Promise`\<`any`\>

Defined in: [offline/cache.ts:718](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L718)

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

Defined in: [offline/cache.ts:1605](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1605)

#### Parameters

##### state

`any`

#### Returns

`void`

***

### setBootstrapSnapshot()

> **setBootstrapSnapshot**(`snapshot`): `void`

Defined in: [offline/cache.ts:1574](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1574)

#### Parameters

##### snapshot

`any`

#### Returns

`void`

***

### setBootstrapSnapshotStatus()

> **setBootstrapSnapshotStatus**(`status`): `void`

Defined in: [offline/cache.ts:1590](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1590)

#### Parameters

##### status

`any`

#### Returns

`void`

***

### setCustomersLastSync()

> **setCustomersLastSync**(`timestamp`): `void`

Defined in: [offline/cache.ts:1777](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1777)

#### Parameters

##### timestamp

`any`

#### Returns

`void`

***

### setCustomerStorage()

> **setCustomerStorage**(`customers`): `Promise`\<`void`\>

Defined in: [offline/customers.ts:189](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L189)

#### Parameters

##### customers

`AnyRecord`[]

#### Returns

`Promise`\<`void`\>

***

### setInvoiceOutboxMode()

> **setInvoiceOutboxMode**(`mode`): `void`

Defined in: [offline/invoiceOutbox.ts:80](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L80)

#### Parameters

##### mode

[`InvoiceOutboxMode`](#invoiceoutboxmode)

#### Returns

`void`

***

### setItemsLastSync()

> **setItemsLastSync**(`timestamp`): `void`

Defined in: [offline/cache.ts:1768](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1768)

#### Parameters

##### timestamp

`any`

#### Returns

`void`

***

### setLastSyncTotals()

> **setLastSyncTotals**(`totals`): `void`

Defined in: [offline/invoices.ts:258](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoices.ts#L258)

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

Defined in: [offline/stock.ts:258](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/stock.ts#L258)

#### Parameters

##### cache

`AnyRecord`

#### Returns

`void`

***

### setManualOffline()

> **setManualOffline**(`state`): `void`

Defined in: [offline/db.ts:1319](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1319)

#### Parameters

##### state

`any`

#### Returns

`void`

***

### setOpeningDialogStorage()

> **setOpeningDialogStorage**(`data`): `void`

Defined in: [offline/cache.ts:1698](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1698)

#### Parameters

##### data

`any`

#### Returns

`void`

***

### setOpeningStorage()

> **setOpeningStorage**(`data`): `void`

Defined in: [offline/cache.ts:1667](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1667)

#### Parameters

##### data

`any`

#### Returns

`void`

***

### setPrintTemplate()

> **setPrintTemplate**(`template`): `void`

Defined in: [offline/cache.ts:1896](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1896)

#### Parameters

##### template

`any`

#### Returns

`void`

***

### setProfileBuyingPriceList()

> **setProfileBuyingPriceList**(`profile`, `buyingPriceList`): `Promise`\<`void`\>

Defined in: [offline/cache.ts:1362](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1362)

#### Parameters

##### profile

`any`

##### buyingPriceList

`string` \| `null` \| `undefined`

#### Returns

`Promise`\<`void`\>

***

### setSalesPersonsStorage()

> **setSalesPersonsStorage**(`data`): `void`

Defined in: [offline/cache.ts:1524](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1524)

#### Parameters

##### data

`any`

#### Returns

`void`

***

### setStockCacheReady()

> **setStockCacheReady**(`ready`): `void`

Defined in: [offline/stock.ts:113](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/stock.ts#L113)

#### Parameters

##### ready

`boolean`

#### Returns

`void`

***

### setSyncResourceState()

> **setSyncResourceState**(`state`): `Promise`\<`void`\>

Defined in: [offline/sync/syncState.ts:41](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/syncState.ts#L41)

#### Parameters

##### state

[`SyncResourceState`](#syncresourcestate)

#### Returns

`Promise`\<`void`\>

***

### setSyncResourceStates()

> **setSyncResourceStates**(`states`): `Promise`\<`void`\>

Defined in: [offline/sync/syncState.ts:58](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/syncState.ts#L58)

#### Parameters

##### states

[`SyncResourceState`](#syncresourcestate)[]

#### Returns

`Promise`\<`void`\>

***

### setTaxInclusiveSetting()

> **setTaxInclusiveSetting**(`value`): `void`

Defined in: [offline/cache.ts:1711](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1711)

#### Parameters

##### value

`any`

#### Returns

`void`

***

### setTermsAndConditions()

> **setTermsAndConditions**(`terms`): `void`

Defined in: [offline/cache.ts:1916](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1916)

#### Parameters

##### terms

`any`

#### Returns

`void`

***

### shouldWriteInvoiceOutbox()

> **shouldWriteInvoiceOutbox**(): `boolean`

Defined in: [offline/invoiceOutbox.ts:85](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L85)

#### Returns

`boolean`

***

### stageItemCatalogRows()

> **stageItemCatalogRows**(`items`, `scope`, `generation`): `Promise`\<`number`\>

Defined in: [offline/cache.ts:500](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L500)

#### Parameters

##### items

`Record`\<`string`, `any`\>[]

##### scope

`string`

##### generation

`string`

#### Returns

`Promise`\<`number`\>

***

### syncBootstrapConfigResource()

> **syncBootstrapConfigResource**(`args`): `Promise`\<`ResourceSyncResult`\>

Defined in: [offline/sync/adapters/bootstrapConfig.ts:48](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/adapters/bootstrapConfig.ts#L48)

#### Parameters

##### args

`BootCriticalSyncArgs`

#### Returns

`Promise`\<`ResourceSyncResult`\>

***

### syncCurrencyMatrixResource()

> **syncCurrencyMatrixResource**(`args`): `Promise`\<`ResourceSyncResult`\>

Defined in: [offline/sync/adapters/currencyMatrix.ts:39](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/adapters/currencyMatrix.ts#L39)

#### Parameters

##### args

`CurrencyMatrixSyncArgs`

#### Returns

`Promise`\<`ResourceSyncResult`\>

***

### syncCustomersResource()

> **syncCustomersResource**(`args`): `Promise`\<`ResourceSyncResult`\>

Defined in: [offline/sync/adapters/customers.ts:172](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/adapters/customers.ts#L172)

#### Parameters

##### args

`CustomersSyncArgs`

#### Returns

`Promise`\<`ResourceSyncResult`\>

***

### syncInvoiceOutboxResource()

> **syncInvoiceOutboxResource**(`callOfflineSyncMethod`): `Promise`\<\{ `acknowledged`: `number`; `consecutiveFailures`: `number`; `lastError`: `string` \| `null`; `lastSyncedAt`: `string`; `pendingCount`: `number`; `resourceId`: `string`; `status`: `string`; `watermark`: `string`; \}\>

Defined in: [offline/invoiceOutbox.ts:278](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L278)

#### Parameters

##### callOfflineSyncMethod

(`method`, `args?`) => `Promise`\<`any`\>

#### Returns

`Promise`\<\{ `acknowledged`: `number`; `consecutiveFailures`: `number`; `lastError`: `string` \| `null`; `lastSyncedAt`: `string`; `pendingCount`: `number`; `resourceId`: `string`; `status`: `string`; `watermark`: `string`; \}\>

***

### syncItemPricesResource()

> **syncItemPricesResource**(`args`): `Promise`\<`ResourceSyncResult`\>

Defined in: [offline/sync/adapters/itemPrices.ts:37](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/adapters/itemPrices.ts#L37)

#### Parameters

##### args

`ItemPricesSyncArgs`

#### Returns

`Promise`\<`ResourceSyncResult`\>

***

### syncItemsResource()

> **syncItemsResource**(`args`): `Promise`\<`ResourceSyncResult`\>

Defined in: [offline/sync/adapters/items.ts:279](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/adapters/items.ts#L279)

#### Parameters

##### args

`ItemsSyncArgs`

#### Returns

`Promise`\<`ResourceSyncResult`\>

***

### syncOfflineCashMovements()

> **syncOfflineCashMovements**(): `Promise`\<\{ `pending`: `any`; `synced`: `number`; \}\>

Defined in: [offline/cash\_movements.ts:72](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cash_movements.ts#L72)

#### Returns

`Promise`\<\{ `pending`: `any`; `synced`: `number`; \}\>

***

### syncOfflineCustomers()

> **syncOfflineCustomers**(): `Promise`\<\{ `pending`: `any`; `synced`: `number`; \}\>

Defined in: [offline/customers.ts:75](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L75)

#### Returns

`Promise`\<\{ `pending`: `any`; `synced`: `number`; \}\>

***

### syncOfflineInvoices()

> **syncOfflineInvoices**(): `Promise`\<\{ `drafted`: `number`; `pending`: `any`; `synced`: `number`; \}\>

Defined in: [offline/invoices.ts:271](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoices.ts#L271)

#### Returns

`Promise`\<\{ `drafted`: `number`; `pending`: `any`; `synced`: `number`; \}\>

***

### syncOfflinePayments()

> **syncOfflinePayments**(): `Promise`\<\{ `pending`: `any`; `synced`: `number`; \}\>

Defined in: [offline/payments.ts:67](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/payments.ts#L67)

#### Returns

`Promise`\<\{ `pending`: `any`; `synced`: `number`; \}\>

***

### syncPaymentMethodCurrenciesResource()

> **syncPaymentMethodCurrenciesResource**(`args`): `Promise`\<`ResourceSyncResult`\>

Defined in: [offline/sync/adapters/paymentMethodCurrencies.ts:24](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/adapters/paymentMethodCurrencies.ts#L24)

#### Parameters

##### args

`PaymentMethodSyncArgs`

#### Returns

`Promise`\<`ResourceSyncResult`\>

***

### syncPriceListMetaResource()

> **syncPriceListMetaResource**(`args`): `Promise`\<`ResourceSyncResult`\>

Defined in: [offline/sync/adapters/bootstrapConfig.ts:92](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/adapters/bootstrapConfig.ts#L92)

#### Parameters

##### args

`BootCriticalSyncArgs`

#### Returns

`Promise`\<`ResourceSyncResult`\>

***

### syncPricingRulesResource()

> **syncPricingRulesResource**(`args`): `Promise`\<`ResourceSyncResult`\>

Defined in: [offline/sync/adapters/pricingRules.ts:80](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/adapters/pricingRules.ts#L80)

#### Parameters

##### args

`PricingRulesSyncArgs`

#### Returns

`Promise`\<`ResourceSyncResult`\>

***

### syncStockResource()

> **syncStockResource**(`args`): `Promise`\<`ResourceSyncResult`\>

Defined in: [offline/sync/adapters/stock.ts:55](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/adapters/stock.ts#L55)

#### Parameters

##### args

`StockSyncArgs`

#### Returns

`Promise`\<`ResourceSyncResult`\>

***

### toggleManualOffline()

> **toggleManualOffline**(): `void`

Defined in: [offline/db.ts:1324](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1324)

#### Returns

`void`

***

### updateLocalStock()

> **updateLocalStock**(`items`): `void`

Defined in: [offline/stock.ts:121](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/stock.ts#L121)

#### Parameters

##### items

`AnyRecord`[]

#### Returns

`void`

***

### updateLocalStockCache()

> **updateLocalStockCache**(`items`): `void`

Defined in: [offline/stock.ts:159](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/stock.ts#L159)

#### Parameters

##### items

`AnyRecord`[]

#### Returns

`void`

***

### updateLocalStockWithActualQuantities()

> **updateLocalStockWithActualQuantities**(`invoiceItems`, `serverItems`): `void`

Defined in: [offline/stock.ts:210](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/stock.ts#L210)

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

Defined in: [offline/customers.ts:37](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/customers.ts#L37)

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

Defined in: [offline/writeQueue.ts:613](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L613)

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

Defined in: [offline/sync/useSyncCoordinator.ts:8](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/useSyncCoordinator.ts#L8)

#### Returns

[`SyncCoordinator`](#synccoordinator)

***

### validateStockForOfflineInvoice()

> **validateStockForOfflineInvoice**(`items`, `invoice?`): `object`

Defined in: [offline/invoices.ts:62](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoices.ts#L62)

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

Defined in: [offline/db.ts:707](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L707)

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

***

### withItemCatalogRefreshLock()

> **withItemCatalogRefreshLock**\<`T`\>(`scope`, `task`): `Promise`\<`T`\>

Defined in: [offline/cache.ts:423](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L423)

#### Type Parameters

##### T

`T`

#### Parameters

##### scope

`string`

##### task

() => `Promise`\<`T`\>

#### Returns

`Promise`\<`T`\>

## Classes

### SyncCoordinator

Defined in: [offline/sync/SyncCoordinator.ts:109](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/SyncCoordinator.ts#L109)

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

Defined in: [offline/sync/SyncCoordinator.ts:128](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/SyncCoordinator.ts#L128)

###### Parameters

###### options?

`SyncCoordinatorOptions` = `{}`

###### Returns

[`SyncCoordinator`](#synccoordinator)

#### Methods

##### getLastRunSummary()

> **getLastRunSummary**(): `any`

Defined in: [offline/sync/SyncCoordinator.ts:166](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/SyncCoordinator.ts#L166)

###### Returns

`any`

##### getResourceState()

> **getResourceState**(`resourceId`): \{ `consecutiveFailures`: `number`; `cooldownMs?`: `number` \| `null`; `lastAttemptAt?`: `string` \| `null`; `lastError`: `string` \| `null`; `lastSuccessHash`: `string` \| `null`; `lastSyncedAt`: `string` \| `null`; `lastTrigger?`: [`SyncTrigger`](#synctrigger) \| `null`; `nextRetryAt?`: `string` \| `null`; `resourceId`: [`SyncResourceId`](#syncresourceid); `schemaVersion`: `string` \| `null`; `scopeSignature`: `string` \| `null`; `status`: [`SyncLifecycleState`](#synclifecyclestate); `watermark`: `string` \| `null`; \} \| `null`

Defined in: [offline/sync/SyncCoordinator.ts:152](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/SyncCoordinator.ts#L152)

Returns a snapshot of the current state for a single resource,
or `null` if the resource ID is not registered.

###### Parameters

###### resourceId

[`SyncResourceId`](#syncresourceid)

###### Returns

\{ `consecutiveFailures`: `number`; `cooldownMs?`: `number` \| `null`; `lastAttemptAt?`: `string` \| `null`; `lastError`: `string` \| `null`; `lastSuccessHash`: `string` \| `null`; `lastSyncedAt`: `string` \| `null`; `lastTrigger?`: [`SyncTrigger`](#synctrigger) \| `null`; `nextRetryAt?`: `string` \| `null`; `resourceId`: [`SyncResourceId`](#syncresourceid); `schemaVersion`: `string` \| `null`; `scopeSignature`: `string` \| `null`; `status`: [`SyncLifecycleState`](#synclifecyclestate); `watermark`: `string` \| `null`; \} \| `null`

##### getResourceStates()

> **getResourceStates**(): `object`[]

Defined in: [offline/sync/SyncCoordinator.ts:160](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/SyncCoordinator.ts#L160)

Returns snapshots of the current state for all registered resources.

###### Returns

`object`[]

##### hydrateResourceStates()

> **hydrateResourceStates**(`states`): `void`

Defined in: [offline/sync/SyncCoordinator.ts:176](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/SyncCoordinator.ts#L176)

Replaces in-memory resource states with the supplied values, then emits a state-change
notification. Used to restore persisted state after a page reload.

###### Parameters

###### states

[`SyncResourceState`](#syncresourcestate)[]

###### Returns

`void`

##### runTrigger()

> **runTrigger**(`trigger`): `Promise`\<`void`\>

Defined in: [offline/sync/SyncCoordinator.ts:196](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/SyncCoordinator.ts#L196)

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

Defined in: [offline/invoiceOutbox.ts:21](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L21)

#### Properties

##### acknowledged\_at

> **acknowledged\_at**: `string` \| `null`

Defined in: [offline/invoiceOutbox.ts:35](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L35)

##### client\_request\_id

> **client\_request\_id**: `string`

Defined in: [offline/invoiceOutbox.ts:23](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L23)

##### created\_at

> **created\_at**: `string`

Defined in: [offline/invoiceOutbox.ts:28](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L28)

##### data

> **data**: `AnyRecord`

Defined in: [offline/invoiceOutbox.ts:27](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L27)

##### invoice

> **invoice**: `AnyRecord`

Defined in: [offline/invoiceOutbox.ts:26](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L26)

##### invoice\_name

> **invoice\_name**: `string` \| `null`

Defined in: [offline/invoiceOutbox.ts:34](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L34)

##### last\_error

> **last\_error**: `string` \| `null`

Defined in: [offline/invoiceOutbox.ts:33](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L33)

##### next\_retry\_at

> **next\_retry\_at**: `string` \| `null`

Defined in: [offline/invoiceOutbox.ts:30](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L30)

##### nextAttemptAt?

> `optional` **nextAttemptAt?**: `string` \| `null`

Defined in: [offline/invoiceOutbox.ts:31](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L31)

##### outbox\_id?

> `optional` **outbox\_id?**: `number`

Defined in: [offline/invoiceOutbox.ts:22](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L22)

##### resource?

> `optional` **resource?**: `"invoice_outbox"`

Defined in: [offline/invoiceOutbox.ts:24](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L24)

##### retry\_count

> **retry\_count**: `number`

Defined in: [offline/invoiceOutbox.ts:32](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L32)

##### status

> **status**: [`InvoiceOutboxStatus`](#invoiceoutboxstatus)

Defined in: [offline/invoiceOutbox.ts:25](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L25)

##### updated\_at

> **updated\_at**: `string`

Defined in: [offline/invoiceOutbox.ts:29](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L29)

***

### OfflineQueueEntry

Defined in: [offline/writeQueue.ts:22](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L22)

#### Properties

##### created\_at

> **created\_at**: `string`

Defined in: [offline/writeQueue.ts:27](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L27)

##### entity\_type

> **entity\_type**: [`OfflineEntityType`](#offlineentitytype)

Defined in: [offline/writeQueue.ts:24](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L24)

##### idempotency\_key

> **idempotency\_key**: `string`

Defined in: [offline/writeQueue.ts:32](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L32)

##### last\_attempt\_at

> **last\_attempt\_at**: `string` \| `null`

Defined in: [offline/writeQueue.ts:28](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L28)

##### last\_error

> **last\_error**: `string` \| `null`

Defined in: [offline/writeQueue.ts:33](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L33)

##### next\_attempt\_at?

> `optional` **next\_attempt\_at?**: `string` \| `null`

Defined in: [offline/writeQueue.ts:29](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L29)

##### payload

> **payload**: `AnyRecord`

Defined in: [offline/writeQueue.ts:26](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L26)

##### queue\_id?

> `optional` **queue\_id?**: `number`

Defined in: [offline/writeQueue.ts:23](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L23)

##### resource?

> `optional` **resource?**: [`OfflineEntityType`](#offlineentitytype)

Defined in: [offline/writeQueue.ts:25](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L25)

##### retry\_count

> **retry\_count**: `number`

Defined in: [offline/writeQueue.ts:30](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L30)

##### status

> **status**: [`OfflineQueueStatus`](#offlinequeuestatus)

Defined in: [offline/writeQueue.ts:31](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L31)

***

### SyncResourceDefinition

Defined in: [offline/sync/types.ts:73](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L73)

Static definition of a single sync resource. Registered in `resourceRegistry.ts`
and consumed by `SyncCoordinator`.

#### Properties

##### fullResyncSupported

> **fullResyncSupported**: `boolean`

Defined in: [offline/sync/types.ts:89](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L89)

Whether the adapter supports full-resync (wiping and re-fetching all records).

##### id

> **id**: [`SyncResourceId`](#syncresourceid)

Defined in: [offline/sync/types.ts:75](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L75)

Unique identifier.

##### mode

> **mode**: [`SyncResourceMode`](#syncresourcemode)

Defined in: [offline/sync/types.ts:79](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L79)

Fetch strategy.

##### priority

> **priority**: [`SyncResourcePriority`](#syncresourcepriority)

Defined in: [offline/sync/types.ts:81](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L81)

Execution priority within a trigger run.

##### scope

> **scope**: `"customer"` \| `"company"` \| `"global"` \| `"profile"`

Defined in: [offline/sync/types.ts:77](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L77)

Data isolation boundary — determines the scope-signature used for cache invalidation.

##### storageKey

> **storageKey**: `string`

Defined in: [offline/sync/types.ts:85](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L85)

IndexedDB/localStorage key prefix used by the adapter.

##### triggers

> **triggers**: [`SyncTrigger`](#synctrigger)[]

Defined in: [offline/sync/types.ts:83](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L83)

Which triggers activate this resource.

##### ttlMs?

> `optional` **ttlMs?**: `number` \| `null`

Defined in: [offline/sync/types.ts:91](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L91)

Optional TTL in milliseconds. `null` means no expiry.

##### watermarkType

> **watermarkType**: `"none"` \| `"timestamp"` \| `"cursor"`

Defined in: [offline/sync/types.ts:87](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L87)

Watermark type used for delta syncs. `"none"` means full-resync every time.

***

### SyncResourceState

Defined in: [offline/sync/types.ts:104](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L104)

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

Defined in: [offline/sync/types.ts:111](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L111)

##### cooldownMs?

> `optional` **cooldownMs?**: `number` \| `null`

Defined in: [offline/sync/types.ts:114](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L114)

##### lastAttemptAt?

> `optional` **lastAttemptAt?**: `string` \| `null`

Defined in: [offline/sync/types.ts:112](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L112)

##### lastError

> **lastError**: `string` \| `null`

Defined in: [offline/sync/types.ts:110](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L110)

##### lastSuccessHash

> **lastSuccessHash**: `string` \| `null`

Defined in: [offline/sync/types.ts:109](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L109)

##### lastSyncedAt

> **lastSyncedAt**: `string` \| `null`

Defined in: [offline/sync/types.ts:107](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L107)

##### lastTrigger?

> `optional` **lastTrigger?**: [`SyncTrigger`](#synctrigger) \| `null`

Defined in: [offline/sync/types.ts:115](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L115)

##### nextRetryAt?

> `optional` **nextRetryAt?**: `string` \| `null`

Defined in: [offline/sync/types.ts:113](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L113)

##### resourceId

> **resourceId**: [`SyncResourceId`](#syncresourceid)

Defined in: [offline/sync/types.ts:105](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L105)

##### schemaVersion

> **schemaVersion**: `string` \| `null`

Defined in: [offline/sync/types.ts:117](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L117)

##### scopeSignature

> **scopeSignature**: `string` \| `null`

Defined in: [offline/sync/types.ts:116](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L116)

##### status

> **status**: [`SyncLifecycleState`](#synclifecyclestate)

Defined in: [offline/sync/types.ts:106](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L106)

##### watermark

> **watermark**: `string` \| `null`

Defined in: [offline/sync/types.ts:108](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L108)

***

### SyncTriggerResourceSummary

Defined in: [offline/sync/types.ts:120](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L120)

#### Properties

##### error

> **error**: `string` \| `null`

Defined in: [offline/sync/types.ts:125](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L125)

##### priority

> **priority**: [`SyncResourcePriority`](#syncresourcepriority)

Defined in: [offline/sync/types.ts:122](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L122)

##### resourceId

> **resourceId**: [`SyncResourceId`](#syncresourceid)

Defined in: [offline/sync/types.ts:121](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L121)

##### skipped

> **skipped**: `boolean`

Defined in: [offline/sync/types.ts:124](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L124)

##### status

> **status**: [`SyncLifecycleState`](#synclifecyclestate)

Defined in: [offline/sync/types.ts:123](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L123)

***

### SyncTriggerRunSummary

Defined in: [offline/sync/types.ts:128](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L128)

#### Properties

##### bootCriticalFailures

> **bootCriticalFailures**: `number`

Defined in: [offline/sync/types.ts:136](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L136)

##### errors

> **errors**: `object`[]

Defined in: [offline/sync/types.ts:137](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L137)

###### message

> **message**: `string`

###### priority

> **priority**: [`SyncResourcePriority`](#syncresourcepriority)

###### resourceId

> **resourceId**: [`SyncResourceId`](#syncresourceid)

##### failed

> **failed**: `number`

Defined in: [offline/sync/types.ts:134](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L134)

##### finishedAt

> **finishedAt**: `string`

Defined in: [offline/sync/types.ts:131](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L131)

##### resources

> **resources**: [`SyncTriggerResourceSummary`](#synctriggerresourcesummary)[]

Defined in: [offline/sync/types.ts:142](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L142)

##### resourcesTotal

> **resourcesTotal**: `number`

Defined in: [offline/sync/types.ts:132](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L132)

##### skipped

> **skipped**: `number`

Defined in: [offline/sync/types.ts:135](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L135)

##### startedAt

> **startedAt**: `string`

Defined in: [offline/sync/types.ts:130](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L130)

##### succeeded

> **succeeded**: `number`

Defined in: [offline/sync/types.ts:133](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L133)

##### trigger

> **trigger**: [`SyncTrigger`](#synctrigger)

Defined in: [offline/sync/types.ts:129](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L129)

## Type Aliases

### ApplicableItemPriceQuery

> **ApplicableItemPriceQuery** = `object`

Defined in: [offline/repositories/ItemPriceRepository.ts:20](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L20)

#### Properties

##### currency?

> `optional` **currency?**: `string` \| `null`

Defined in: [offline/repositories/ItemPriceRepository.ts:25](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L25)

##### customer?

> `optional` **customer?**: `string` \| `null`

Defined in: [offline/repositories/ItemPriceRepository.ts:24](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L24)

##### date?

> `optional` **date?**: `string` \| `null`

Defined in: [offline/repositories/ItemPriceRepository.ts:26](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L26)

##### itemCode

> **itemCode**: `string`

Defined in: [offline/repositories/ItemPriceRepository.ts:22](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L22)

##### priceList

> **priceList**: `string`

Defined in: [offline/repositories/ItemPriceRepository.ts:21](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L21)

##### uom

> **uom**: `string`

Defined in: [offline/repositories/ItemPriceRepository.ts:23](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L23)

***

### InvoiceOutboxMode

> **InvoiceOutboxMode** = `"off"` \| `"dual_write"` \| `"coordinator"`

Defined in: [offline/invoiceOutbox.ts:13](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L13)

***

### InvoiceOutboxStatus

> **InvoiceOutboxStatus** = `"pending"` \| `"syncing"` \| `"retrying"` \| `"acknowledged"` \| `"dead_letter"`

Defined in: [offline/invoiceOutbox.ts:14](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/invoiceOutbox.ts#L14)

***

### OfflineEntityType

> **OfflineEntityType** = `"invoice"` \| `"customer"` \| `"payment"` \| `"cash_movement"`

Defined in: [offline/writeQueue.ts:9](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L9)

***

### OfflineItemPriceRecord

> **OfflineItemPriceRecord** = `object`

Defined in: [offline/repositories/ItemPriceRepository.ts:3](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L3)

#### Indexable

> \[`key`: `string`\]: `any`

#### Properties

##### buying?

> `optional` **buying?**: `number` \| `boolean` \| `null`

Defined in: [offline/repositories/ItemPriceRepository.ts:11](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L11)

##### currency?

> `optional` **currency?**: `string` \| `null`

Defined in: [offline/repositories/ItemPriceRepository.ts:8](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L8)

##### customer?

> `optional` **customer?**: `string` \| `null`

Defined in: [offline/repositories/ItemPriceRepository.ts:9](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L9)

##### item\_code

> **item\_code**: `string`

Defined in: [offline/repositories/ItemPriceRepository.ts:6](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L6)

##### modified?

> `optional` **modified?**: `string` \| `null`

Defined in: [offline/repositories/ItemPriceRepository.ts:16](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L16)

##### name

> **name**: `string`

Defined in: [offline/repositories/ItemPriceRepository.ts:4](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L4)

##### price\_list

> **price\_list**: `string`

Defined in: [offline/repositories/ItemPriceRepository.ts:5](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L5)

##### price\_list\_rate?

> `optional` **price\_list\_rate?**: `number` \| `null`

Defined in: [offline/repositories/ItemPriceRepository.ts:13](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L13)

##### selling?

> `optional` **selling?**: `number` \| `boolean` \| `null`

Defined in: [offline/repositories/ItemPriceRepository.ts:12](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L12)

##### supplier?

> `optional` **supplier?**: `string` \| `null`

Defined in: [offline/repositories/ItemPriceRepository.ts:10](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L10)

##### uom?

> `optional` **uom?**: `string` \| `null`

Defined in: [offline/repositories/ItemPriceRepository.ts:7](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L7)

##### valid\_from?

> `optional` **valid\_from?**: `string` \| `null`

Defined in: [offline/repositories/ItemPriceRepository.ts:14](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L14)

##### valid\_upto?

> `optional` **valid\_upto?**: `string` \| `null`

Defined in: [offline/repositories/ItemPriceRepository.ts:15](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/repositories/ItemPriceRepository.ts#L15)

***

### OfflinePruneResult

> **OfflinePruneResult** = `object`

Defined in: [offline/db.ts:1213](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1213)

#### Properties

##### invoiceOutbox

> **invoiceOutbox**: `number`

Defined in: [offline/db.ts:1214](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1214)

##### localTelemetry

> **localTelemetry**: `number`

Defined in: [offline/db.ts:1218](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1218)

##### syncState

> **syncState**: `number`

Defined in: [offline/db.ts:1216](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1216)

##### tombstones

> **tombstones**: `number`

Defined in: [offline/db.ts:1217](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1217)

##### writeQueue

> **writeQueue**: `number`

Defined in: [offline/db.ts:1215](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L1215)

***

### OfflineQueueStatus

> **OfflineQueueStatus** = `"pending"` \| `"syncing"` \| `"failed"` \| `"dead_letter"` \| `"synced"`

Defined in: [offline/writeQueue.ts:15](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/writeQueue.ts#L15)

***

### SyncLifecycleState

> **SyncLifecycleState** = `"idle"` \| `"syncing"` \| `"fresh"` \| `"stale"` \| `"error"` \| `"limited"`

Defined in: [offline/sync/types.ts:61](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L61)

Per-resource lifecycle state exposed to the UI:
- `"idle"` — not yet synced in this session.
- `"syncing"` — fetch in progress.
- `"fresh"` — successfully synced and within TTL.
- `"stale"` — synced but TTL has expired.
- `"error"` — last sync attempt failed.
- `"limited"` — partial data available (e.g. scope mismatch).

***

### SyncResourceId

> **SyncResourceId** = `"bootstrap_config"` \| `"price_list_meta"` \| `"currency_matrix"` \| `"payment_method_currencies"` \| `"item_groups"` \| `"offers"` \| `"items"` \| `"item_prices"` \| `"pricing_rules"` \| `"stock"` \| `"customers"` \| `"invoice_outbox"` \| `"customer_addresses"` \| `"delivery_charges"`

Defined in: [offline/sync/types.ts:5](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L5)

All registered offline-sync resource identifiers.
Each ID maps 1-to-1 with a [SyncResourceDefinition](#syncresourcedefinition) in the resource registry.

***

### SyncResourceMode

> **SyncResourceMode** = `"delta"` \| `"scoped"` \| `"on_demand"`

Defined in: [offline/sync/types.ts:27](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L27)

How a resource is synchronised from the server:
- `"delta"` — fetch only records changed since the last watermark.
- `"scoped"` — fetch all records whose scope (profile/company/customer) matches the current session.
- `"on_demand"` — fetched only when explicitly requested, not on a schedule.

***

### SyncResourcePriority

> **SyncResourcePriority** = `"boot_critical"` \| `"warm"` \| `"lazy"`

Defined in: [offline/sync/types.ts:35](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L35)

Controls the order in which resources are processed within a single trigger run:
- `"boot_critical"` — must succeed before the POS is usable offline.
- `"warm"` — important but not blocking; synced after boot-critical resources.
- `"lazy"` — can be deferred until the app is idle.

***

### SyncTrigger

> **SyncTrigger** = `"boot"` \| `"online_resume"` \| `"timer"` \| `"profile_change"` \| `"user_action"`

Defined in: [offline/sync/types.ts:45](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/sync/types.ts#L45)

Events that can kick off a sync run:
- `"boot"` — app startup.
- `"online_resume"` — network connection regained.
- `"timer"` — periodic background tick.
- `"profile_change"` — POS profile switched mid-session.
- `"user_action"` — explicit user-initiated refresh.

## Variables

### db

> `const` **db**: `any`

Defined in: [offline/db.ts:51](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L51)

***

### DERIVED\_OFFLINE\_CACHE\_KEYS

> `const` **DERIVED\_OFFLINE\_CACHE\_KEYS**: readonly `string`[]

Defined in: [offline/db.ts:199](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L199)

***

### initPromise

> `const` **initPromise**: `Promise`\<`void`\>

Defined in: [offline/db.ts:680](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L680)

***

### KEY\_TABLE\_MAP

> `const` **KEY\_TABLE\_MAP**: `Record`\<`string`, `string`\>

Defined in: [offline/db.ts:111](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L111)

***

### memory

> `const` **memory**: `AnyRecord`

Defined in: [offline/db.ts:397](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L397)

***

### memoryInitPromise

> `const` **memoryInitPromise**: `Promise`\<`void`\> = `initPromise`

Defined in: [offline/index.ts:53](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/index.ts#L53)

***

### PENDING\_OFFLINE\_QUEUE\_KEYS

> `const` **PENDING\_OFFLINE\_QUEUE\_KEYS**: readonly `string`[]

Defined in: [offline/db.ts:192](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L192)

***

### PERSIST\_WORKER\_READY\_TIMEOUT\_MS

> `const` **PERSIST\_WORKER\_READY\_TIMEOUT\_MS**: `30000` = `30_000`

Defined in: [offline/db.ts:517](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L517)

***

### PERSIST\_WORKER\_TIMEOUT\_MS

> `const` **PERSIST\_WORKER\_TIMEOUT\_MS**: `10000` = `10_000`

Defined in: [offline/db.ts:516](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L516)

***

### setTaxTemplate

> `const` **setTaxTemplate**: (`name`, `doc`) => `void` = `saveTaxTemplate`

Defined in: [offline/cache.ts:1508](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/cache.ts#L1508)

#### Parameters

##### name

`any`

##### doc

`any`

#### Returns

`void`

***

### STARTUP\_MEMORY\_KEYS

> `const` **STARTUP\_MEMORY\_KEYS**: readonly `string`[]

Defined in: [offline/db.ts:173](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L173)

***

### startupInitPromise

> `const` **startupInitPromise**: `Promise`\<`void`\>

Defined in: [offline/db.ts:666](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/offline/db.ts#L666)
