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

Defined in: [lib/pricingEngine.ts:668](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/lib/pricingEngine.ts#L668)

#### Parameters

##### params

###### baseRate?

`number`

###### ctx?

`AnyRecord`

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

Defined in: [lib/pricingEngine.ts:155](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/lib/pricingEngine.ts#L155)

Collects all pricing-rule candidates applicable to `item` from the pre-built index.

Candidates are de-duplicated by rule name. The order is: item-specific → group → brand → general.
Callers must then filter by date, party, currency, and quantity thresholds.

#### Parameters

##### item?

`AnyRecord` = `{}`

The cart item to match against.

##### indexBundle?

Pre-built lookup maps produced by `usePricingRulesStore`.

###### byBrand?

`Map`\<`string`, `AnyRecord`[]\>

###### byGroup?

`Map`\<`string`, `AnyRecord`[]\>

###### byItem?

`Map`\<`string`, `AnyRecord`[]\>

###### general?

`AnyRecord`[]

#### Returns

`AnyRecord`[]

***

### computeFreeItems()

> **computeFreeItems**(`params`): `AnyRecord`[]

Defined in: [lib/pricingEngine.ts:685](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/lib/pricingEngine.ts#L685)

#### Parameters

##### params

###### baseRate?

`number`

###### ctx?

`AnyRecord`

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

Defined in: [lib/pricingEngine.ts:490](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/lib/pricingEngine.ts#L490)

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

###### ctx?

`AnyRecord`

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

Defined in: [lib/pricingEngine.ts:44](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/lib/pricingEngine.ts#L44)

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

Defined in: [lib/pricingEngine.ts:79](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/lib/pricingEngine.ts#L79)

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

Defined in: [lib/pricingEngine.ts:110](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/lib/pricingEngine.ts#L110)

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

### round()

> **round**(`value`, `precision?`): `number`

Defined in: [lib/pricingEngine.ts:27](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/lib/pricingEngine.ts#L27)

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

Defined in: [lib/pricingEngine.ts:204](https://github.com/defendicon/POS-Awesome-V15/blob/a9b3af2f2a4cdc5a9e2bd878c91253ace4178b1f/frontend/src/lib/pricingEngine.ts#L204)

#### Parameters

##### a

`AnyRecord`

##### b

`AnyRecord`

#### Returns

`number`
