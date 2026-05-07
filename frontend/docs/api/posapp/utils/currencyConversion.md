[**posawesome-frontend**](../../README.md)

***

[posawesome-frontend](../../README.md) / posapp/utils/currencyConversion

# posapp/utils/currencyConversion

## Functions

### getBaseCurrency()

> **getBaseCurrency**(`context`): `string` \| `undefined`

Defined in: [posapp/utils/currencyConversion.ts:27](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/currencyConversion.ts#L27)

Gets the base currency from the context.

#### Parameters

##### context

[`CurrencyContext`](#currencycontext)

#### Returns

`string` \| `undefined`

***

### getCompanyCurrency()

> **getCompanyCurrency**(`context`): `string` \| `undefined`

Defined in: [posapp/utils/currencyConversion.ts:20](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/currencyConversion.ts#L20)

Gets the company currency from the context.

#### Parameters

##### context

[`CurrencyContext`](#currencycontext)

#### Returns

`string` \| `undefined`

***

### isCompanyCurrencySelected()

> **isCompanyCurrencySelected**(`context`): `boolean`

Defined in: [posapp/utils/currencyConversion.ts:33](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/currencyConversion.ts#L33)

Checks if the company currency is currently selected.

#### Parameters

##### context

[`CurrencyContext`](#currencycontext)

#### Returns

`boolean`

***

### toBaseCurrency()

> **toBaseCurrency**(`context`, `amount`): `number` \| `null` \| `undefined`

Defined in: [posapp/utils/currencyConversion.ts:39](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/currencyConversion.ts#L39)

Converts an amount to the base currency.

#### Parameters

##### context

[`CurrencyContext`](#currencycontext)

##### amount

`number` \| `null` \| `undefined`

#### Returns

`number` \| `null` \| `undefined`

***

### toSelectedCurrency()

> **toSelectedCurrency**(`context`, `amount`): `number` \| `null` \| `undefined`

Defined in: [posapp/utils/currencyConversion.ts:53](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/currencyConversion.ts#L53)

Converts an amount to the selected currency.

#### Parameters

##### context

[`CurrencyContext`](#currencycontext)

##### amount

`number` \| `null` \| `undefined`

#### Returns

`number` \| `null` \| `undefined`

## Interfaces

### CurrencyContext

Defined in: [posapp/utils/currencyConversion.ts:6](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/currencyConversion.ts#L6)

Interface for the context required by currency conversion functions.

#### Properties

##### conversion\_rate?

> `optional` **conversion\_rate?**: `number`

Defined in: [posapp/utils/currencyConversion.ts:12](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/currencyConversion.ts#L12)

##### currency\_precision?

> `optional` **currency\_precision?**: `number`

Defined in: [posapp/utils/currencyConversion.ts:13](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/currencyConversion.ts#L13)

##### flt

> **flt**: (`_value`, `_precision?`) => `number`

Defined in: [posapp/utils/currencyConversion.ts:14](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/currencyConversion.ts#L14)

###### Parameters

###### \_value

`number`

###### \_precision?

`number`

###### Returns

`number`

##### pos\_profile?

> `optional` **pos\_profile?**: `object`

Defined in: [posapp/utils/currencyConversion.ts:7](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/currencyConversion.ts#L7)

###### currency?

> `optional` **currency?**: `string`

##### price\_list\_currency?

> `optional` **price\_list\_currency?**: `string`

Defined in: [posapp/utils/currencyConversion.ts:10](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/currencyConversion.ts#L10)

##### selected\_currency?

> `optional` **selected\_currency?**: `string`

Defined in: [posapp/utils/currencyConversion.ts:11](https://github.com/defendicon/POS-Awesome-V15/blob/9e132ec6d5e8255838c37e2e2c41a75a25684fe2/frontend/src/posapp/utils/currencyConversion.ts#L11)
