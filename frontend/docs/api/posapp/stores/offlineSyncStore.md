[**posawesome-frontend**](../../README.md)

***

[posawesome-frontend](../../README.md) / posapp/stores/offlineSyncStore

# posapp/stores/offlineSyncStore

## Functions

### getSyncResourceLabel()

> **getSyncResourceLabel**(`resourceId`): `string`

Defined in: [posapp/stores/offlineSyncStore.ts:102](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/posapp/stores/offlineSyncStore.ts#L102)

#### Parameters

##### resourceId

[`SyncResourceId`](../../offline.md#syncresourceid)

#### Returns

`string`

## Interfaces

### OfflineBootstrapWarning

Defined in: [posapp/stores/offlineSyncStore.ts:54](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/posapp/stores/offlineSyncStore.ts#L54)

#### Properties

##### active

> **active**: `boolean`

Defined in: [posapp/stores/offlineSyncStore.ts:55](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/posapp/stores/offlineSyncStore.ts#L55)

##### messages

> **messages**: `string`[]

Defined in: [posapp/stores/offlineSyncStore.ts:57](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/posapp/stores/offlineSyncStore.ts#L57)

##### title

> **title**: `string`

Defined in: [posapp/stores/offlineSyncStore.ts:56](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/posapp/stores/offlineSyncStore.ts#L56)

***

### OfflineCapabilitySummary

Defined in: [posapp/stores/offlineSyncStore.ts:60](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/posapp/stores/offlineSyncStore.ts#L60)

#### Extends

- `BootstrapCapabilitySummary`

#### Properties

##### action

> **action**: `string`

Defined in: [offline/bootstrapSnapshot.ts:123](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/offline/bootstrapSnapshot.ts#L123)

###### Inherited from

`BootstrapCapabilitySummary.action`

##### id

> **id**: `BootstrapCapabilityId`

Defined in: [offline/bootstrapSnapshot.ts:118](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/offline/bootstrapSnapshot.ts#L118)

###### Inherited from

`BootstrapCapabilitySummary.id`

##### label

> **label**: `string`

Defined in: [offline/bootstrapSnapshot.ts:119](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/offline/bootstrapSnapshot.ts#L119)

###### Inherited from

`BootstrapCapabilitySummary.label`

##### message

> **message**: `string`

Defined in: [offline/bootstrapSnapshot.ts:122](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/offline/bootstrapSnapshot.ts#L122)

###### Inherited from

`BootstrapCapabilitySummary.message`

##### policy

> **policy**: `BootstrapOfflinePolicyMode` \| `null`

Defined in: [offline/bootstrapSnapshot.ts:126](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/offline/bootstrapSnapshot.ts#L126)

###### Inherited from

`BootstrapCapabilitySummary.policy`

##### prerequisites

> **prerequisites**: `string`[]

Defined in: [offline/bootstrapSnapshot.ts:125](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/offline/bootstrapSnapshot.ts#L125)

###### Inherited from

`BootstrapCapabilitySummary.prerequisites`

##### severity

> **severity**: `BootstrapCapabilitySeverity`

Defined in: [offline/bootstrapSnapshot.ts:121](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/offline/bootstrapSnapshot.ts#L121)

###### Inherited from

`BootstrapCapabilitySummary.severity`

##### status

> **status**: `BootstrapCapabilityStatus`

Defined in: [offline/bootstrapSnapshot.ts:120](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/offline/bootstrapSnapshot.ts#L120)

###### Inherited from

`BootstrapCapabilitySummary.status`

##### warningCodes

> **warningCodes**: `string`[]

Defined in: [offline/bootstrapSnapshot.ts:124](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/offline/bootstrapSnapshot.ts#L124)

###### Inherited from

`BootstrapCapabilitySummary.warningCodes`

***

### OfflineStatusSummary

Defined in: [posapp/stores/offlineSyncStore.ts:40](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/posapp/stores/offlineSyncStore.ts#L40)

#### Properties

##### cacheUsage

> **cacheUsage**: `number`

Defined in: [posapp/stores/offlineSyncStore.ts:46](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/posapp/stores/offlineSyncStore.ts#L46)

##### cacheUsageDetails

> **cacheUsageDetails**: `object`

Defined in: [posapp/stores/offlineSyncStore.ts:47](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/posapp/stores/offlineSyncStore.ts#L47)

###### indexedDB

> **indexedDB**: `number`

###### localStorage

> **localStorage**: `number`

###### total

> **total**: `number`

##### manualOffline

> **manualOffline**: `boolean`

Defined in: [posapp/stores/offlineSyncStore.ts:44](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/posapp/stores/offlineSyncStore.ts#L44)

##### networkOnline

> **networkOnline**: `boolean`

Defined in: [posapp/stores/offlineSyncStore.ts:41](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/posapp/stores/offlineSyncStore.ts#L41)

##### pendingInvoices

> **pendingInvoices**: `number`

Defined in: [posapp/stores/offlineSyncStore.ts:45](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/posapp/stores/offlineSyncStore.ts#L45)

##### serverConnecting

> **serverConnecting**: `boolean`

Defined in: [posapp/stores/offlineSyncStore.ts:43](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/posapp/stores/offlineSyncStore.ts#L43)

##### serverOnline

> **serverOnline**: `boolean`

Defined in: [posapp/stores/offlineSyncStore.ts:42](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/posapp/stores/offlineSyncStore.ts#L42)

## Variables

### useOfflineSyncStore

> `const` **useOfflineSyncStore**: `StoreDefinition`\<`"offlineSync"`, `Pick`\<\{ `attentionResources`: `ComputedRef`\<`object`[]\>; `bootstrapWarning`: `Ref`\<\{ `active`: `boolean`; `messages`: `string`[]; `title`: `string`; \}, [`OfflineBootstrapWarning`](#offlinebootstrapwarning) \| \{ `active`: `boolean`; `messages`: `string`[]; `title`: `string`; \}\>; `capabilitySummaries`: `Ref`\<`object`[], [`OfflineCapabilitySummary`](#offlinecapabilitysummary)[] \| `object`[]\>; `connectivityLabel`: `ComputedRef`\<`"Checking"` \| `"Offline"` \| `"Online"` \| `"Limited"`\>; `connectivityTone`: `ComputedRef`\<`"warning"` \| `"success"` \| `"danger"`\>; `panelOpen`: `Ref`\<`boolean`, `boolean`\>; `reset`: () => `void`; `resourceStates`: `Ref`\<`object`[], [`SyncResourceState`](../../offline.md#syncresourcestate)[] \| `object`[]\>; `setBootstrapWarning`: (`nextWarning`) => `void`; `setCapabilitySummaries`: (`nextSummaries`) => `void`; `setPanelOpen`: (`value`) => `void`; `setResourceStates`: (`nextStates`) => `void`; `setSummary`: (`nextSummary`) => `void`; `sortedResources`: `ComputedRef`\<`object`[]\>; `summary`: `Ref`\<\{ `cacheUsage`: `number`; `cacheUsageDetails`: \{ `indexedDB`: `number`; `localStorage`: `number`; `total`: `number`; \}; `manualOffline`: `boolean`; `networkOnline`: `boolean`; `pendingInvoices`: `number`; `serverConnecting`: `boolean`; `serverOnline`: `boolean`; \}, [`OfflineStatusSummary`](#offlinestatussummary) \| \{ `cacheUsage`: `number`; `cacheUsageDetails`: \{ `indexedDB`: `number`; `localStorage`: `number`; `total`: `number`; \}; `manualOffline`: `boolean`; `networkOnline`: `boolean`; `pendingInvoices`: `number`; `serverConnecting`: `boolean`; `serverOnline`: `boolean`; \}\>; `summaryMessage`: `ComputedRef`\<`string`\>; `syncingResourcesCount`: `ComputedRef`\<`number`\>; `togglePanel`: (`force?`) => `void`; \}, `"summary"` \| `"panelOpen"` \| `"bootstrapWarning"` \| `"capabilitySummaries"` \| `"resourceStates"`\>, `Pick`\<\{ `attentionResources`: `ComputedRef`\<`object`[]\>; `bootstrapWarning`: `Ref`\<\{ `active`: `boolean`; `messages`: `string`[]; `title`: `string`; \}, [`OfflineBootstrapWarning`](#offlinebootstrapwarning) \| \{ `active`: `boolean`; `messages`: `string`[]; `title`: `string`; \}\>; `capabilitySummaries`: `Ref`\<`object`[], [`OfflineCapabilitySummary`](#offlinecapabilitysummary)[] \| `object`[]\>; `connectivityLabel`: `ComputedRef`\<`"Checking"` \| `"Offline"` \| `"Online"` \| `"Limited"`\>; `connectivityTone`: `ComputedRef`\<`"warning"` \| `"success"` \| `"danger"`\>; `panelOpen`: `Ref`\<`boolean`, `boolean`\>; `reset`: () => `void`; `resourceStates`: `Ref`\<`object`[], [`SyncResourceState`](../../offline.md#syncresourcestate)[] \| `object`[]\>; `setBootstrapWarning`: (`nextWarning`) => `void`; `setCapabilitySummaries`: (`nextSummaries`) => `void`; `setPanelOpen`: (`value`) => `void`; `setResourceStates`: (`nextStates`) => `void`; `setSummary`: (`nextSummary`) => `void`; `sortedResources`: `ComputedRef`\<`object`[]\>; `summary`: `Ref`\<\{ `cacheUsage`: `number`; `cacheUsageDetails`: \{ `indexedDB`: `number`; `localStorage`: `number`; `total`: `number`; \}; `manualOffline`: `boolean`; `networkOnline`: `boolean`; `pendingInvoices`: `number`; `serverConnecting`: `boolean`; `serverOnline`: `boolean`; \}, [`OfflineStatusSummary`](#offlinestatussummary) \| \{ `cacheUsage`: `number`; `cacheUsageDetails`: \{ `indexedDB`: `number`; `localStorage`: `number`; `total`: `number`; \}; `manualOffline`: `boolean`; `networkOnline`: `boolean`; `pendingInvoices`: `number`; `serverConnecting`: `boolean`; `serverOnline`: `boolean`; \}\>; `summaryMessage`: `ComputedRef`\<`string`\>; `syncingResourcesCount`: `ComputedRef`\<`number`\>; `togglePanel`: (`force?`) => `void`; \}, `"syncingResourcesCount"` \| `"connectivityLabel"` \| `"connectivityTone"` \| `"attentionResources"` \| `"sortedResources"` \| `"summaryMessage"`\>, `Pick`\<\{ `attentionResources`: `ComputedRef`\<`object`[]\>; `bootstrapWarning`: `Ref`\<\{ `active`: `boolean`; `messages`: `string`[]; `title`: `string`; \}, [`OfflineBootstrapWarning`](#offlinebootstrapwarning) \| \{ `active`: `boolean`; `messages`: `string`[]; `title`: `string`; \}\>; `capabilitySummaries`: `Ref`\<`object`[], [`OfflineCapabilitySummary`](#offlinecapabilitysummary)[] \| `object`[]\>; `connectivityLabel`: `ComputedRef`\<`"Checking"` \| `"Offline"` \| `"Online"` \| `"Limited"`\>; `connectivityTone`: `ComputedRef`\<`"warning"` \| `"success"` \| `"danger"`\>; `panelOpen`: `Ref`\<`boolean`, `boolean`\>; `reset`: () => `void`; `resourceStates`: `Ref`\<`object`[], [`SyncResourceState`](../../offline.md#syncresourcestate)[] \| `object`[]\>; `setBootstrapWarning`: (`nextWarning`) => `void`; `setCapabilitySummaries`: (`nextSummaries`) => `void`; `setPanelOpen`: (`value`) => `void`; `setResourceStates`: (`nextStates`) => `void`; `setSummary`: (`nextSummary`) => `void`; `sortedResources`: `ComputedRef`\<`object`[]\>; `summary`: `Ref`\<\{ `cacheUsage`: `number`; `cacheUsageDetails`: \{ `indexedDB`: `number`; `localStorage`: `number`; `total`: `number`; \}; `manualOffline`: `boolean`; `networkOnline`: `boolean`; `pendingInvoices`: `number`; `serverConnecting`: `boolean`; `serverOnline`: `boolean`; \}, [`OfflineStatusSummary`](#offlinestatussummary) \| \{ `cacheUsage`: `number`; `cacheUsageDetails`: \{ `indexedDB`: `number`; `localStorage`: `number`; `total`: `number`; \}; `manualOffline`: `boolean`; `networkOnline`: `boolean`; `pendingInvoices`: `number`; `serverConnecting`: `boolean`; `serverOnline`: `boolean`; \}\>; `summaryMessage`: `ComputedRef`\<`string`\>; `syncingResourcesCount`: `ComputedRef`\<`number`\>; `togglePanel`: (`force?`) => `void`; \}, `"reset"` \| `"setPanelOpen"` \| `"togglePanel"` \| `"setSummary"` \| `"setBootstrapWarning"` \| `"setCapabilitySummaries"` \| `"setResourceStates"`\>\>

Defined in: [posapp/stores/offlineSyncStore.ts:106](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/posapp/stores/offlineSyncStore.ts#L106)
