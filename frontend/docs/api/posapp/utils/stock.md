[**posawesome-frontend**](../../README.md)

***

[posawesome-frontend](../../README.md) / posapp/utils/stock

# posapp/utils/stock

## Functions

### formatNegativeStockWarning()

> **formatNegativeStockWarning**(`itemName`, `availableQty`, `requestedQty`): `string`

Defined in: [posapp/utils/stock.ts:124](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/stock.ts#L124)

Formats a negative stock warning message.

#### Parameters

##### itemName

`string` \| `null`

The name of the item

##### availableQty

`number`

The quantity currently available

##### requestedQty

`number`

The quantity that would be added/removed

#### Returns

`string`

Formatted translated string

***

### formatStockShortageError()

> **formatStockShortageError**(`itemName`, `availableQty`, `requestedQty`): `string`

Defined in: [posapp/utils/stock.ts:102](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/stock.ts#L102)

Formats a stock shortage error message.

#### Parameters

##### itemName

`string` \| `null`

The name of the item

##### availableQty

`number`

The quantity currently available

##### requestedQty

`number`

The quantity requested by the user

#### Returns

`string`

Formatted translated string

***

### parseBooleanSetting()

> **parseBooleanSetting**(`value`): `boolean`

Defined in: [posapp/utils/stock.ts:12](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/stock.ts#L12)

Parses a value into a boolean based on standard Frappe/POS settings.

#### Parameters

##### value

`any`

The value to parse (string, number, or boolean)

#### Returns

`boolean`

boolean

***

### shouldBlockSaleForStock()

> **shouldBlockSaleForStock**(`__namedParameters`): `boolean`

Defined in: [posapp/utils/stock.ts:45](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/stock.ts#L45)

Returns whether the active stock policy blocks the requested sale quantity.
This is shared by Classic validation, Counter Grid alternates, scanner input,
and the final cart insertion guard so presentation cannot change stock rules.

#### Parameters

##### \_\_namedParameters

[`StockSalePolicyOptions`](#stocksalepolicyoptions)

#### Returns

`boolean`

## Interfaces

### StockSalePolicyOptions

Defined in: [posapp/utils/stock.ts:29](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/stock.ts#L29)

#### Properties

##### availableQty?

> `optional` **availableQty?**: `unknown`

Defined in: [posapp/utils/stock.ts:32](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/stock.ts#L32)

##### blockSaleBeyondAvailableQty?

> `optional` **blockSaleBeyondAvailableQty?**: `unknown`

Defined in: [posapp/utils/stock.ts:35](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/stock.ts#L35)

##### deferStockValidationToPayment?

> `optional` **deferStockValidationToPayment?**: `boolean`

Defined in: [posapp/utils/stock.ts:37](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/stock.ts#L37)

##### isReturnInvoice?

> `optional` **isReturnInvoice?**: `boolean`

Defined in: [posapp/utils/stock.ts:36](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/stock.ts#L36)

##### item

> **item**: `Record`\<`string`, `any`\> \| `null` \| `undefined`

Defined in: [posapp/utils/stock.ts:30](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/stock.ts#L30)

##### posProfile?

> `optional` **posProfile?**: `Record`\<`string`, `any`\> \| `null`

Defined in: [posapp/utils/stock.ts:33](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/stock.ts#L33)

##### requestedQty?

> `optional` **requestedQty?**: `unknown`

Defined in: [posapp/utils/stock.ts:31](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/stock.ts#L31)

##### stockSettings?

> `optional` **stockSettings?**: `Record`\<`string`, `any`\> \| `null`

Defined in: [posapp/utils/stock.ts:34](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/stock.ts#L34)
