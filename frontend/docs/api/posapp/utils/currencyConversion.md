[**posawesome-frontend**](../../README.md)

***

[posawesome-frontend](../../README.md) / posapp/utils/currencyConversion

# posapp/utils/currencyConversion

## Functions

### getBaseCurrency()

> **getBaseCurrency**(`context`): `string` \| `undefined`

Defined in: [posapp/utils/currencyConversion.ts:36](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/posapp/utils/currencyConversion.ts#L36)

Gets the base currency from the context.

#### Parameters

##### context

[`CurrencyContext`](#currencycontext)

#### Returns

`string` \| `undefined`

***

### getCompanyCurrency()

> **getCompanyCurrency**(`context`): `string` \| `undefined`

Defined in: [posapp/utils/currencyConversion.ts:29](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/posapp/utils/currencyConversion.ts#L29)

Gets the company currency from the context.

#### Parameters

##### context

[`CurrencyContext`](#currencycontext)

#### Returns

`string` \| `undefined`

***

### isCompanyCurrencySelected()

> **isCompanyCurrencySelected**(`context`): `boolean`

Defined in: [posapp/utils/currencyConversion.ts:42](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/posapp/utils/currencyConversion.ts#L42)

Checks if the company currency is currently selected.

#### Parameters

##### context

[`CurrencyContext`](#currencycontext)

#### Returns

`boolean`

***

### toBaseCurrency()

> **toBaseCurrency**(`context`, `amount`): `number` \| `null` \| `undefined`

Defined in: [posapp/utils/currencyConversion.ts:48](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/posapp/utils/currencyConversion.ts#L48)

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

Defined in: [posapp/utils/currencyConversion.ts:61](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/posapp/utils/currencyConversion.ts#L61)

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

Defined in: [posapp/utils/currencyConversion.ts:12](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/posapp/utils/currencyConversion.ts#L12)

Interface for the context required by currency conversion functions.

#### Properties

##### company?

> `optional` **company?**: `object`

Defined in: [posapp/utils/currencyConversion.ts:13](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/posapp/utils/currencyConversion.ts#L13)

###### default\_currency?

> `optional` **default\_currency?**: `string`

##### conversion\_rate?

> `optional` **conversion\_rate?**: `number`

Defined in: [posapp/utils/currencyConversion.ts:21](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/posapp/utils/currencyConversion.ts#L21)

##### currency\_precision?

> `optional` **currency\_precision?**: `number`

Defined in: [posapp/utils/currencyConversion.ts:22](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/posapp/utils/currencyConversion.ts#L22)

##### flt

> **flt**: (`_value`, `_precision?`) => `number`

Defined in: [posapp/utils/currencyConversion.ts:23](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/posapp/utils/currencyConversion.ts#L23)

###### Parameters

###### \_value

`number`

###### \_precision?

`number`

###### Returns

`number`

##### pos\_profile?

> `optional` **pos\_profile?**: `object`

Defined in: [posapp/utils/currencyConversion.ts:16](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/posapp/utils/currencyConversion.ts#L16)

###### currency?

> `optional` **currency?**: `string`

##### price\_list\_currency?

> `optional` **price\_list\_currency?**: `string`

Defined in: [posapp/utils/currencyConversion.ts:19](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/posapp/utils/currencyConversion.ts#L19)

##### selected\_currency?

> `optional` **selected\_currency?**: `string`

Defined in: [posapp/utils/currencyConversion.ts:20](https://github.com/defendicon/POS-Awesome-V15/blob/b841aa1d6d7678aabf664b452c73c2f5ed8d8758/frontend/src/posapp/utils/currencyConversion.ts#L20)
