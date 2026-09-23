[**posawesome-frontend**](../../README.md)

***

[posawesome-frontend](../../README.md) / posapp/utils/exchangeSessionStorage

# posapp/utils/exchangeSessionStorage

## Functions

### clearStoredExchangeSession()

> **clearStoredExchangeSession**(`storage?`): `void`

Defined in: [posapp/utils/exchangeSessionStorage.ts:101](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L101)

#### Parameters

##### storage?

`Storage` \| `null`

#### Returns

`void`

***

### exchangeSessionMatchesScope()

> **exchangeSessionMatchesScope**(`session`, `scope`): `boolean`

Defined in: [posapp/utils/exchangeSessionStorage.ts:111](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L111)

#### Parameters

##### session

[`PersistedExchangeSession`](#persistedexchangesession)

##### scope

[`ExchangeSessionScope`](#exchangesessionscope)

#### Returns

`boolean`

***

### readExchangeSession()

> **readExchangeSession**(`storage?`, `now?`): [`PersistedExchangeSession`](#persistedexchangesession) \| `null`

Defined in: [posapp/utils/exchangeSessionStorage.ts:50](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L50)

#### Parameters

##### storage?

`Storage` \| `null`

##### now?

`number` = `...`

#### Returns

[`PersistedExchangeSession`](#persistedexchangesession) \| `null`

***

### writeExchangeSession()

> **writeExchangeSession**(`session`, `storage?`, `now?`): `boolean`

Defined in: [posapp/utils/exchangeSessionStorage.ts:80](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L80)

#### Parameters

##### session

[`PersistedExchangeSession`](#persistedexchangesession) \| `Omit`\<[`PersistedExchangeSession`](#persistedexchangesession), `"version"` \| `"savedAt"`\>

##### storage?

`Storage` \| `null`

##### now?

`number` = `...`

#### Returns

`boolean`

## Interfaces

### ExchangeSessionScope

Defined in: [posapp/utils/exchangeSessionStorage.ts:22](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L22)

#### Properties

##### company?

> `optional` **company?**: `string` \| `null`

Defined in: [posapp/utils/exchangeSessionStorage.ts:24](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L24)

##### openingShift?

> `optional` **openingShift?**: `string` \| `null`

Defined in: [posapp/utils/exchangeSessionStorage.ts:25](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L25)

##### posProfile?

> `optional` **posProfile?**: `string` \| `null`

Defined in: [posapp/utils/exchangeSessionStorage.ts:23](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L23)

##### user?

> `optional` **user?**: `string` \| `null`

Defined in: [posapp/utils/exchangeSessionStorage.ts:26](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L26)

***

### PersistedExchangeSession

Defined in: [posapp/utils/exchangeSessionStorage.ts:6](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L6)

#### Properties

##### clientRequestId

> **clientRequestId**: `string`

Defined in: [posapp/utils/exchangeSessionStorage.ts:9](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L9)

##### company

> **company**: `string`

Defined in: [posapp/utils/exchangeSessionStorage.ts:11](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L11)

##### openingShift

> **openingShift**: `string`

Defined in: [posapp/utils/exchangeSessionStorage.ts:12](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L12)

##### originalInvoice

> **originalInvoice**: `any`

Defined in: [posapp/utils/exchangeSessionStorage.ts:14](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L14)

##### posProfile

> **posProfile**: `string`

Defined in: [posapp/utils/exchangeSessionStorage.ts:10](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L10)

##### returnDoc

> **returnDoc**: `any`

Defined in: [posapp/utils/exchangeSessionStorage.ts:16](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L16)

##### returnDraft

> **returnDraft**: `any`

Defined in: [posapp/utils/exchangeSessionStorage.ts:15](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L15)

##### returnTotal

> **returnTotal**: `number`

Defined in: [posapp/utils/exchangeSessionStorage.ts:18](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L18)

##### saleDraft

> **saleDraft**: `any`

Defined in: [posapp/utils/exchangeSessionStorage.ts:17](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L17)

##### savedAt

> **savedAt**: `number`

Defined in: [posapp/utils/exchangeSessionStorage.ts:19](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L19)

##### stage

> **stage**: [`ExchangeStage`](#exchangestage)

Defined in: [posapp/utils/exchangeSessionStorage.ts:8](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L8)

##### user

> **user**: `string`

Defined in: [posapp/utils/exchangeSessionStorage.ts:13](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L13)

##### version

> **version**: `1`

Defined in: [posapp/utils/exchangeSessionStorage.ts:7](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L7)

## Type Aliases

### ExchangeStage

> **ExchangeStage** = `"return"` \| `"sale"`

Defined in: [posapp/utils/exchangeSessionStorage.ts:4](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L4)

## Variables

### EXCHANGE\_SESSION\_MAX\_AGE\_MS

> `const` **EXCHANGE\_SESSION\_MAX\_AGE\_MS**: `number`

Defined in: [posapp/utils/exchangeSessionStorage.ts:2](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L2)

***

### EXCHANGE\_SESSION\_STORAGE\_KEY

> `const` **EXCHANGE\_SESSION\_STORAGE\_KEY**: `"posawesome:item-exchange:v1"` = `"posawesome:item-exchange:v1"`

Defined in: [posapp/utils/exchangeSessionStorage.ts:1](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/posapp/utils/exchangeSessionStorage.ts#L1)
