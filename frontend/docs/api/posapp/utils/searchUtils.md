[**posawesome-frontend**](../../README.md)

***

[posawesome-frontend](../../README.md) / posapp/utils/searchUtils

# posapp/utils/searchUtils

## Functions

### extractItemCodeFromSearch()

> **extractItemCodeFromSearch**(`searchString`, `scalePrefix`, `scaleBarcodeMatches`): `string`

Defined in: [posapp/utils/searchUtils.ts:13](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/searchUtils.ts#L13)

Extract item code from a potential scale barcode

#### Parameters

##### searchString

`string`

The search/barcode string

##### scalePrefix

`string`

The scale barcode prefix

##### scaleBarcodeMatches

(`_val`) => `boolean`

Function to check if string matches scale barcode

#### Returns

`string`

Extracted item code or original string

***

### isValidSearchQuery()

> **isValidSearchQuery**(`query`): `boolean`

Defined in: [posapp/utils/searchUtils.ts:50](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/searchUtils.ts#L50)

Check if a search query is valid (non-empty after trimming)

#### Parameters

##### query

`any`

Search query to validate

#### Returns

`boolean`

True if query is valid

***

### normalizeSearchInputValue()

> **normalizeSearchInputValue**(`event`): `string`

Defined in: [posapp/utils/searchUtils.ts:88](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/searchUtils.ts#L88)

Normalize input event value to a string

#### Parameters

##### event

`any`

Event or raw string

#### Returns

`string`

string

***

### normalizeSearchQuery()

> **normalizeSearchQuery**(`query`): `string`

Defined in: [posapp/utils/searchUtils.ts:40](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/searchUtils.ts#L40)

Sanitize and normalize a search query

#### Parameters

##### query

`any`

Raw search query

#### Returns

`string`

Normalized query

***

### shouldReloadOnSearchClear()

> **shouldReloadOnSearchClear**(`params`): `boolean`

Defined in: [posapp/utils/searchUtils.ts:70](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/searchUtils.ts#L70)

Check if search should trigger a reload

#### Parameters

##### params

[`ReloadOnSearchClearParams`](#reloadonsearchclearparams)

Parameters

#### Returns

`boolean`

True if reload is needed

## Interfaces

### ReloadOnSearchClearParams

Defined in: [posapp/utils/searchUtils.ts:58](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/searchUtils.ts#L58)

Interface for reload parameters

#### Properties

##### currentSearch

> **currentSearch**: `string`

Defined in: [posapp/utils/searchUtils.ts:59](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/searchUtils.ts#L59)

##### itemsCount

> **itemsCount**: `number`

Defined in: [posapp/utils/searchUtils.ts:62](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/searchUtils.ts#L62)

##### itemsLoaded

> **itemsLoaded**: `boolean`

Defined in: [posapp/utils/searchUtils.ts:61](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/searchUtils.ts#L61)

##### previousSearch

> **previousSearch**: `string`

Defined in: [posapp/utils/searchUtils.ts:60](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/searchUtils.ts#L60)
