[**posawesome-frontend**](../../README.md)

***

[posawesome-frontend](../../README.md) / posapp/utils/stock

# posapp/utils/stock

## Functions

### formatNegativeStockWarning()

> **formatNegativeStockWarning**(`itemName`, `availableQty`, `requestedQty`): `string`

Defined in: [posapp/utils/stock.ts:55](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/posapp/utils/stock.ts#L55)

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

Defined in: [posapp/utils/stock.ts:36](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/posapp/utils/stock.ts#L36)

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

Defined in: [posapp/utils/stock.ts:12](https://github.com/defendicon/POS-Awesome-V15/blob/8947095fbfc8af113ba946d00a76764f6861af8e/frontend/src/posapp/utils/stock.ts#L12)

Parses a value into a boolean based on standard Frappe/POS settings.

#### Parameters

##### value

`any`

The value to parse (string, number, or boolean)

#### Returns

`boolean`

boolean
