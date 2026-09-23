[**posawesome-frontend**](../README.md)

***

[posawesome-frontend](../README.md) / lib/pricingEngine

# lib/pricingEngine

Offline pricing-rule evaluation engine.

Applies Frappe/ERPNext pricing rules to a single cart item without any network calls.
Used by `usePricingRulesStore` which holds a pre-loaded rule snapshot from IndexedDB.

The primary entry point is [evaluatePricingRules](#evaluatepricingrules). Helper functions
([collectCandidates](#collectcandidates), [ruleSort](#rulesort), [matchParty](#matchparty), etc.) are exported
for unit testing but are not part of the public API contract — they may change.

## Functions

### applyLocalPricingRules()

> **applyLocalPricingRules**(`params`): `object`

Defined in: [lib/pricingEngine.ts:768](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/lib/pricingEngine.ts#L768)

#### Parameters

##### params

###### baseRate?

`number`

###### cartAmount?

`string` \| `number`

###### ctx?

`AnyRecord`

###### docAmount?

`string` \| `number`

###### docQty?

`string` \| `number`

###### indexes?

[`PricingRuleIndexBundle`](#pricingruleindexbundle)

###### item

`AnyRecord`

###### qty?

`string` \| `number`

#### Returns

`object`

##### applied

> **applied**: `AnyRecord`[]

##### discountPerUnit

> **discountPerUnit**: `number`

##### rate

> **rate**: `number`

***

### collectCandidates()

> **collectCandidates**(`item?`, `indexBundle?`): `AnyRecord`[]

Defined in: [lib/pricingEngine.ts:174](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/lib/pricingEngine.ts#L174)

Collects all pricing-rule candidates applicable to `item` from the pre-built index.

Candidates are de-duplicated by rule name. The order is: item-specific → group → brand → general.
Callers must then filter by date, party, currency, and quantity thresholds.

#### Parameters

##### item?

`AnyRecord` = `{}`

The cart item to match against.

##### indexBundle?

[`PricingRuleIndexBundle`](#pricingruleindexbundle) = `{}`

Pre-built lookup maps produced by `usePricingRulesStore`.

#### Returns

`AnyRecord`[]

***

### computeFreeItems()

> **computeFreeItems**(`params`): `AnyRecord`[]

Defined in: [lib/pricingEngine.ts:782](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/lib/pricingEngine.ts#L782)

#### Parameters

##### params

###### baseRate?

`number`

###### cartAmount?

`string` \| `number`

###### ctx?

`AnyRecord`

###### docAmount?

`string` \| `number`

###### docQty?

`string` \| `number`

###### indexes?

\{ `byBrand?`: `Map`\<`string`, `AnyRecord`[]\>; `byGroup?`: `Map`\<`string`, `AnyRecord`[]\>; `byItem?`: `Map`\<`string`, `AnyRecord`[]\>; `general?`: `AnyRecord`[]; \}

###### indexes.byBrand?

`Map`\<`string`, `AnyRecord`[]\>

###### indexes.byGroup?

`Map`\<`string`, `AnyRecord`[]\>

###### indexes.byItem?

`Map`\<`string`, `AnyRecord`[]\>

###### indexes.general?

`AnyRecord`[]

###### item

`AnyRecord`

###### qty?

`string` \| `number`

#### Returns

`AnyRecord`[]

***

### evaluatePricingRules()

> **evaluatePricingRules**(`__namedParameters`): `object`

Defined in: [lib/pricingEngine.ts:534](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/lib/pricingEngine.ts#L534)

Evaluates all applicable pricing rules for a single cart item in one pass.

Returns two independent results:
- `pricing` — the final rate and accumulated discount after applying non-free-item rules.
- `freebies` — zero or more free-item records to be added to the invoice by the caller.

Rules are applied in priority order determined by [ruleSort](#rulesort). A rule with
`stop_further_rules` halts pricing-rule processing; `apply_multiple_pricing_rules`
controls whether subsequent rules are also applied.

Input fields (all part of the single destructured argument):
- `item` — cart item to evaluate; must have `item_code`, `item_group`, and `brand`.
- `qty` — line quantity (UOM-adjusted). Defaults to `item.qty`.
- `docQty` — document-level quantity used for threshold checks.
- `baseRate` — starting rate before discounts. Defaults to `item.base_price_list_rate`.
- `ctx` — evaluation context: date, customer, customer_group, territory, price_list, currency.
- `indexes` — pre-built rule index from `usePricingRulesStore.buildIndexes()`.

#### Parameters

##### \_\_namedParameters

###### baseRate?

`number`

###### cartAmount?

`string` \| `number`

###### ctx?

`AnyRecord`

###### docAmount?

`string` \| `number`

###### docQty?

`string` \| `number`

###### evaluationScope?

`"line"` \| `"transaction"` = `"line"`

###### indexes?

[`PricingRuleIndexBundle`](#pricingruleindexbundle)

###### item

`AnyRecord`

###### qty?

`string` \| `number`

#### Returns

`object`

##### freebies

> **freebies**: `AnyRecord`[]

##### pricing

> **pricing**: `object`

###### pricing.applied

> **applied**: `AnyRecord`[]

###### pricing.discountPerUnit

> **discountPerUnit**: `number`

###### pricing.rate

> **rate**: `number`

***

### evaluateTransactionPricingRules()

> **evaluateTransactionPricingRules**(`__namedParameters`): `object`

Defined in: [lib/pricingEngine.ts:736](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/lib/pricingEngine.ts#L736)

Evaluates rules whose ERPNext scope is the whole transaction exactly once.
Transaction rules are header-level rules: their quantity and amount thresholds
use cart totals and a fixed discount amount must not be repeated per item/qty.

#### Parameters

##### \_\_namedParameters

###### cartAmount?

`string` \| `number`

###### cartQty?

`string` \| `number`

###### ctx?

`AnyRecord`

###### indexes?

[`PricingRuleIndexBundle`](#pricingruleindexbundle)

#### Returns

`object`

##### freebies

> **freebies**: `AnyRecord`[]

##### pricing

> **pricing**: `object`

###### pricing.applied

> **applied**: `AnyRecord`[]

###### pricing.discountPerUnit

> **discountPerUnit**: `number`

###### pricing.rate

> **rate**: `number`

***

### inDateRange()

> **inDateRange**(`currentDate`, `start`, `end`): `boolean`

Defined in: [lib/pricingEngine.ts:57](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/lib/pricingEngine.ts#L57)

Returns `true` when `currentDate` falls within the `[start, end]` range.
A missing `start` or `end` is treated as unbounded. A missing or unparseable
`currentDate` returns `true` (permissive — the rule is not excluded on date grounds).

#### Parameters

##### currentDate

`string` \| `Date` \| `null` \| `undefined`

##### start

`string` \| `Date` \| `null` \| `undefined`

##### end

`string` \| `Date` \| `null` \| `undefined`

#### Returns

`boolean`

***

### matchParty()

> **matchParty**(`rule`, `customer`, `customerGroup`, `territory`): `boolean`

Defined in: [lib/pricingEngine.ts:92](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/lib/pricingEngine.ts#L92)

Returns `true` when the pricing rule's customer/group/territory restrictions are
satisfied by the current invoice context.
A rule with no restrictions on a dimension always passes that dimension's check.

#### Parameters

##### rule

`AnyRecord`

##### customer

`string` \| `null` \| `undefined`

##### customerGroup

`string` \| `null` \| `undefined`

##### territory

`string` \| `null` \| `undefined`

#### Returns

`boolean`

***

### matchPriceListAndCurrency()

> **matchPriceListAndCurrency**(`rule`, `priceList`, `currency`): `boolean`

Defined in: [lib/pricingEngine.ts:123](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/lib/pricingEngine.ts#L123)

#### Parameters

##### rule

`AnyRecord`

##### priceList

`string` \| `null` \| `undefined`

##### currency

`string` \| `null` \| `undefined`

#### Returns

`boolean`

***

### matchUom()

> **matchUom**(`rule`, `item`): `boolean`

Defined in: [lib/pricingEngine.ts:143](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/lib/pricingEngine.ts#L143)

#### Parameters

##### rule

`AnyRecord`

##### item

`AnyRecord`

#### Returns

`boolean`

***

### round()

> **round**(`value`, `precision?`): `number`

Defined in: [lib/pricingEngine.ts:40](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/lib/pricingEngine.ts#L40)

Rounds `value` to `precision` decimal places using symmetric (half-up) rounding.
Non-finite inputs return `0`.

#### Parameters

##### value

`unknown`

##### precision?

`number` = `DEFAULT_PRECISION`

#### Returns

`number`

***

### ruleSort()

> **ruleSort**(`a`, `b`): `number`

Defined in: [lib/pricingEngine.ts:218](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/lib/pricingEngine.ts#L218)

#### Parameters

##### a

`AnyRecord`

##### b

`AnyRecord`

#### Returns

`number`

## Type Aliases

### PricingRuleIndexBundle

> **PricingRuleIndexBundle** = `object`

Defined in: [lib/pricingEngine.ts:18](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/lib/pricingEngine.ts#L18)

#### Properties

##### byBrand?

> `optional` **byBrand?**: `Map`\<`string`, `AnyRecord`[]\>

Defined in: [lib/pricingEngine.ts:21](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/lib/pricingEngine.ts#L21)

##### byGroup?

> `optional` **byGroup?**: `Map`\<`string`, `AnyRecord`[]\>

Defined in: [lib/pricingEngine.ts:20](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/lib/pricingEngine.ts#L20)

##### byItem?

> `optional` **byItem?**: `Map`\<`string`, `AnyRecord`[]\>

Defined in: [lib/pricingEngine.ts:19](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/lib/pricingEngine.ts#L19)

##### general?

> `optional` **general?**: `AnyRecord`[]

Defined in: [lib/pricingEngine.ts:22](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/lib/pricingEngine.ts#L22)

##### preSorted?

> `optional` **preSorted?**: `boolean`

Defined in: [lib/pricingEngine.ts:23](https://github.com/defendicon/POS-Awesome-V15/blob/40121e7c2d6955baab54474738b6cd1e42f5c68e/frontend/src/lib/pricingEngine.ts#L23)
