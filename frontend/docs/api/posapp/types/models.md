[**posawesome-frontend**](../../README.md)

***

[posawesome-frontend](../../README.md) / posapp/types/models

# posapp/types/models

## Interfaces

### CartItem

Defined in: [posapp/types/models.ts:45](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L45)

An [Item](#item) that has been added to the active invoice.
Carries per-line pricing and discount state alongside the item's catalogue data.
`posa_row_id` is the stable row key used by `useInvoiceStore` — it is NOT the
ERPNext `name` field and is generated client-side.

#### Extends

- [`Item`](#item)

#### Indexable

> \[`key`: `string`\]: `any`

#### Properties

##### \_scale\_price?

> `optional` **\_scale\_price?**: `number`

Defined in: [posapp/types/models.ts:28](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L28)

###### Inherited from

[`Item`](#item).[`_scale_price`](#_scale_price-1)

##### \_scale\_qty?

> `optional` **\_scale\_qty?**: `number`

Defined in: [posapp/types/models.ts:27](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L27)

###### Inherited from

[`Item`](#item).[`_scale_qty`](#_scale_qty-1)

##### actual\_qty?

> `optional` **actual\_qty?**: `number` \| `null`

Defined in: [posapp/types/models.ts:18](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L18)

###### Inherited from

[`Item`](#item).[`actual_qty`](#actual_qty-1)

##### amount

> **amount**: `number`

Defined in: [posapp/types/models.ts:48](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L48)

Line total = qty × rate, in the selected currency.

##### batch\_no?

> `optional` **batch\_no?**: `string` \| `null`

Defined in: [posapp/types/models.ts:17](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L17)

###### Inherited from

[`Item`](#item).[`batch_no`](#batch_no-1)

##### batch\_no\_data?

> `optional` **batch\_no\_data?**: `Record`\<`string`, `any`\>[]

Defined in: [posapp/types/models.ts:26](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L26)

###### Inherited from

[`Item`](#item).[`batch_no_data`](#batch_no_data-1)

##### brand?

> `optional` **brand?**: `string`

Defined in: [posapp/types/models.ts:15](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L15)

###### Inherited from

[`Item`](#item).[`brand`](#brand-1)

##### conversion\_factor?

> `optional` **conversion\_factor?**: `number`

Defined in: [posapp/types/models.ts:35](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L35)

###### Inherited from

[`Item`](#item).[`conversion_factor`](#conversion_factor-1)

##### currency?

> `optional` **currency?**: `string`

Defined in: [posapp/types/models.ts:59](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L59)

###### Overrides

[`Item`](#item).[`currency`](#currency-1)

##### description?

> `optional` **description?**: `string`

Defined in: [posapp/types/models.ts:9](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L9)

###### Inherited from

[`Item`](#item).[`description`](#description-1)

##### discount\_amount?

> `optional` **discount\_amount?**: `number`

Defined in: [posapp/types/models.ts:52](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L52)

##### discount\_percentage?

> `optional` **discount\_percentage?**: `number`

Defined in: [posapp/types/models.ts:51](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L51)

##### has\_batch\_no?

> `optional` **has\_batch\_no?**: `number`

Defined in: [posapp/types/models.ts:32](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L32)

1 if the item tracks batch numbers, 0 otherwise.

###### Inherited from

[`Item`](#item).[`has_batch_no`](#has_batch_no-1)

##### has\_serial\_no?

> `optional` **has\_serial\_no?**: `number`

Defined in: [posapp/types/models.ts:30](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L30)

1 if the item tracks serial numbers, 0 otherwise.

###### Inherited from

[`Item`](#item).[`has_serial_no`](#has_serial_no-1)

##### image?

> `optional` **image?**: `string`

Defined in: [posapp/types/models.ts:13](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L13)

###### Inherited from

[`Item`](#item).[`image`](#image-2)

##### is\_stock\_item?

> `optional` **is\_stock\_item?**: `number`

Defined in: [posapp/types/models.ts:34](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L34)

1 for stock items, 0 for service/non-stock items.

###### Inherited from

[`Item`](#item).[`is_stock_item`](#is_stock_item-1)

##### item\_code

> **item\_code**: `string`

Defined in: [posapp/types/models.ts:7](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L7)

###### Inherited from

[`Item`](#item).[`item_code`](#item_code-1)

##### item\_group?

> `optional` **item\_group?**: `string`

Defined in: [posapp/types/models.ts:14](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L14)

###### Inherited from

[`Item`](#item).[`item_group`](#item_group-1)

##### item\_name

> **item\_name**: `string`

Defined in: [posapp/types/models.ts:8](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L8)

###### Inherited from

[`Item`](#item).[`item_name`](#item_name-1)

##### item\_uoms?

> `optional` **item\_uoms?**: `Record`\<`string`, `any`\>[]

Defined in: [posapp/types/models.ts:24](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L24)

###### Inherited from

[`Item`](#item).[`item_uoms`](#item_uoms-1)

##### original\_currency?

> `optional` **original\_currency?**: `string`

Defined in: [posapp/types/models.ts:23](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L23)

###### Inherited from

[`Item`](#item).[`original_currency`](#original_currency-1)

##### original\_rate?

> `optional` **original\_rate?**: `number`

Defined in: [posapp/types/models.ts:21](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L21)

###### Inherited from

[`Item`](#item).[`original_rate`](#original_rate-1)

##### posa\_is\_offer?

> `optional` **posa\_is\_offer?**: `boolean`

Defined in: [posapp/types/models.ts:56](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L56)

True when this row was added by the offers engine (free item / promo).

##### posa\_row\_id

> **posa\_row\_id**: `string`

Defined in: [posapp/types/models.ts:54](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L54)

Client-generated stable row identifier (UUID-like).

##### price\_list\_rate?

> `optional` **price\_list\_rate?**: `number`

Defined in: [posapp/types/models.ts:58](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L58)

Original price before discount.

###### Overrides

[`Item`](#item).[`price_list_rate`](#price_list_rate-1)

##### qty

> **qty**: `number`

Defined in: [posapp/types/models.ts:46](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L46)

##### rate

> **rate**: `number`

Defined in: [posapp/types/models.ts:50](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L50)

Effective unit price after discount, in the selected currency.

###### Overrides

[`Item`](#item).[`rate`](#rate-2)

##### serial\_no?

> `optional` **serial\_no?**: `string` \| `null`

Defined in: [posapp/types/models.ts:16](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L16)

###### Inherited from

[`Item`](#item).[`serial_no`](#serial_no-1)

##### serial\_no\_data?

> `optional` **serial\_no\_data?**: `Record`\<`string`, `any`\>[]

Defined in: [posapp/types/models.ts:25](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L25)

###### Inherited from

[`Item`](#item).[`serial_no_data`](#serial_no_data-1)

##### standard\_rate

> **standard\_rate**: `number`

Defined in: [posapp/types/models.ts:11](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L11)

###### Inherited from

[`Item`](#item).[`standard_rate`](#standard_rate-1)

##### stock\_qty

> **stock\_qty**: `number`

Defined in: [posapp/types/models.ts:10](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L10)

###### Inherited from

[`Item`](#item).[`stock_qty`](#stock_qty-1)

##### uom

> **uom**: `string`

Defined in: [posapp/types/models.ts:12](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L12)

###### Inherited from

[`Item`](#item).[`uom`](#uom-1)

***

### Customer

Defined in: [posapp/types/models.ts:151](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L151)

A customer record from the offline customer cache.

#### Indexable

> \[`key`: `string`\]: `any`

#### Properties

##### customer\_group

> **customer\_group**: `string`

Defined in: [posapp/types/models.ts:154](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L154)

##### customer\_name

> **customer\_name**: `string`

Defined in: [posapp/types/models.ts:153](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L153)

##### email\_id?

> `optional` **email\_id?**: `string`

Defined in: [posapp/types/models.ts:156](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L156)

##### image?

> `optional` **image?**: `string`

Defined in: [posapp/types/models.ts:159](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L159)

##### mobile\_no?

> `optional` **mobile\_no?**: `string`

Defined in: [posapp/types/models.ts:157](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L157)

##### name

> **name**: `string`

Defined in: [posapp/types/models.ts:152](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L152)

##### primary\_address?

> `optional` **primary\_address?**: `string`

Defined in: [posapp/types/models.ts:160](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L160)

##### tax\_id?

> `optional` **tax\_id?**: `string`

Defined in: [posapp/types/models.ts:158](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L158)

##### territory

> **territory**: `string`

Defined in: [posapp/types/models.ts:155](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L155)

***

### CustomerSummary

Defined in: [posapp/types/models.ts:164](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L164)

#### Extended by

- [`StoredCustomer`](#storedcustomer)

#### Indexable

> \[`key`: `string`\]: `any`

#### Properties

##### customer\_name

> **customer\_name**: `string`

Defined in: [posapp/types/models.ts:166](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L166)

##### email\_id?

> `optional` **email\_id?**: `string`

Defined in: [posapp/types/models.ts:167](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L167)

##### mobile\_no?

> `optional` **mobile\_no?**: `string`

Defined in: [posapp/types/models.ts:168](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L168)

##### name

> **name**: `string`

Defined in: [posapp/types/models.ts:165](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L165)

##### primary\_address?

> `optional` **primary\_address?**: `string`

Defined in: [posapp/types/models.ts:169](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L169)

***

### DeliveryCharge

Defined in: [posapp/types/models.ts:196](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L196)

A delivery-charge option that can be selected on the invoice.
Populated from the `posa_delivery_charges` child table on the POS Profile.

#### Indexable

> \[`key`: `string`\]: `any`

#### Properties

##### rate

> **rate**: `number`

Defined in: [posapp/types/models.ts:199](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L199)

Charge amount in the company currency.

##### title

> **title**: `string`

Defined in: [posapp/types/models.ts:197](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L197)

***

### InvoiceDoc

Defined in: [posapp/types/models.ts:68](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L68)

The active POS Invoice document, mirroring the ERPNext POS Invoice doctype.
This is the root object managed by `useInvoiceStore`.
Return invoices use negative `qty` and negative totals throughout.

#### Indexable

> \[`key`: `string`\]: `any`

#### Properties

##### additional\_discount\_percentage?

> `optional` **additional\_discount\_percentage?**: `number`

Defined in: [posapp/types/models.ts:85](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L85)

Transaction-level percentage discount (0–100).

##### company

> **company**: `string`

Defined in: [posapp/types/models.ts:74](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L74)

##### customer

> **customer**: `string`

Defined in: [posapp/types/models.ts:75](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L75)

##### customer\_name?

> `optional` **customer\_name?**: `string`

Defined in: [posapp/types/models.ts:76](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L76)

##### delivery\_charges?

> `optional` **delivery\_charges?**: `number`

Defined in: [posapp/types/models.ts:86](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L86)

##### discount\_amount?

> `optional` **discount\_amount?**: `number`

Defined in: [posapp/types/models.ts:83](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L83)

Transaction-level fixed discount amount (selected currency).

##### doctype?

> `optional` **doctype?**: `string`

Defined in: [posapp/types/models.ts:71](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L71)

##### grand\_total

> **grand\_total**: `number`

Defined in: [posapp/types/models.ts:79](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L79)

##### is\_return?

> `optional` **is\_return?**: `number`

Defined in: [posapp/types/models.ts:89](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L89)

1 when this is a return/credit-note invoice.

##### items

> **items**: [`CartItem`](#cartitem)[]

Defined in: [posapp/types/models.ts:77](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L77)

##### name?

> `optional` **name?**: `string`

Defined in: [posapp/types/models.ts:70](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L70)

ERPNext document name, e.g. `"ACC-PSINV-2024-00001"`. Absent on unsaved drafts.

##### net\_total

> **net\_total**: `number`

Defined in: [posapp/types/models.ts:80](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L80)

##### payments

> **payments**: [`Payment`](#payment)[]

Defined in: [posapp/types/models.ts:78](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L78)

##### pos\_profile?

> `optional` **pos\_profile?**: `string`

Defined in: [posapp/types/models.ts:92](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L92)

##### posting\_date

> **posting\_date**: `string`

Defined in: [posapp/types/models.ts:72](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L72)

##### posting\_time?

> `optional` **posting\_time?**: `string`

Defined in: [posapp/types/models.ts:73](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L73)

##### return\_against?

> `optional` **return\_against?**: `string`

Defined in: [posapp/types/models.ts:91](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L91)

Name of the original invoice being returned against.

##### taxes?

> `optional` **taxes?**: [`Tax`](#tax)[]

Defined in: [posapp/types/models.ts:87](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L87)

##### total\_qty

> **total\_qty**: `number`

Defined in: [posapp/types/models.ts:81](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L81)

***

### InvoiceDocRef

Defined in: [posapp/types/models.ts:96](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L96)

#### Properties

##### doctype?

> `optional` **doctype?**: `string`

Defined in: [posapp/types/models.ts:98](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L98)

##### name?

> `optional` **name?**: `string`

Defined in: [posapp/types/models.ts:97](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L97)

***

### InvoiceMetadata

Defined in: [posapp/types/models.ts:184](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L184)

Internal versioning metadata attached to the invoice store.
`changeVersion` is incremented on every mutation and can be used to detect
stale renders or trigger watchers.

#### Indexable

> \[`key`: `string`\]: `any`

#### Properties

##### changeVersion

> **changeVersion**: `number`

Defined in: [posapp/types/models.ts:188](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L188)

Monotonically increasing counter, incremented on every store mutation.

##### lastUpdated

> **lastUpdated**: `number`

Defined in: [posapp/types/models.ts:186](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L186)

Unix timestamp (ms) of the last mutation.

***

### Item

Defined in: [posapp/types/models.ts:6](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L6)

A catalogue item as stored in the offline IndexedDB cache.
Fields mirror the ERPNext Item doctype; `[key: string]: any` accommodates
custom fields added by the Frappe installation.

#### Extended by

- [`CartItem`](#cartitem)

#### Indexable

> \[`key`: `string`\]: `any`

#### Properties

##### \_scale\_price?

> `optional` **\_scale\_price?**: `number`

Defined in: [posapp/types/models.ts:28](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L28)

##### \_scale\_qty?

> `optional` **\_scale\_qty?**: `number`

Defined in: [posapp/types/models.ts:27](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L27)

##### actual\_qty?

> `optional` **actual\_qty?**: `number` \| `null`

Defined in: [posapp/types/models.ts:18](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L18)

##### batch\_no?

> `optional` **batch\_no?**: `string` \| `null`

Defined in: [posapp/types/models.ts:17](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L17)

##### batch\_no\_data?

> `optional` **batch\_no\_data?**: `Record`\<`string`, `any`\>[]

Defined in: [posapp/types/models.ts:26](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L26)

##### brand?

> `optional` **brand?**: `string`

Defined in: [posapp/types/models.ts:15](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L15)

##### conversion\_factor?

> `optional` **conversion\_factor?**: `number`

Defined in: [posapp/types/models.ts:35](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L35)

##### currency?

> `optional` **currency?**: `string`

Defined in: [posapp/types/models.ts:22](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L22)

##### description?

> `optional` **description?**: `string`

Defined in: [posapp/types/models.ts:9](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L9)

##### has\_batch\_no?

> `optional` **has\_batch\_no?**: `number`

Defined in: [posapp/types/models.ts:32](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L32)

1 if the item tracks batch numbers, 0 otherwise.

##### has\_serial\_no?

> `optional` **has\_serial\_no?**: `number`

Defined in: [posapp/types/models.ts:30](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L30)

1 if the item tracks serial numbers, 0 otherwise.

##### image?

> `optional` **image?**: `string`

Defined in: [posapp/types/models.ts:13](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L13)

##### is\_stock\_item?

> `optional` **is\_stock\_item?**: `number`

Defined in: [posapp/types/models.ts:34](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L34)

1 for stock items, 0 for service/non-stock items.

##### item\_code

> **item\_code**: `string`

Defined in: [posapp/types/models.ts:7](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L7)

##### item\_group?

> `optional` **item\_group?**: `string`

Defined in: [posapp/types/models.ts:14](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L14)

##### item\_name

> **item\_name**: `string`

Defined in: [posapp/types/models.ts:8](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L8)

##### item\_uoms?

> `optional` **item\_uoms?**: `Record`\<`string`, `any`\>[]

Defined in: [posapp/types/models.ts:24](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L24)

##### original\_currency?

> `optional` **original\_currency?**: `string`

Defined in: [posapp/types/models.ts:23](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L23)

##### original\_rate?

> `optional` **original\_rate?**: `number`

Defined in: [posapp/types/models.ts:21](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L21)

##### price\_list\_rate?

> `optional` **price\_list\_rate?**: `number`

Defined in: [posapp/types/models.ts:20](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L20)

##### rate?

> `optional` **rate?**: `number`

Defined in: [posapp/types/models.ts:19](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L19)

##### serial\_no?

> `optional` **serial\_no?**: `string` \| `null`

Defined in: [posapp/types/models.ts:16](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L16)

##### serial\_no\_data?

> `optional` **serial\_no\_data?**: `Record`\<`string`, `any`\>[]

Defined in: [posapp/types/models.ts:25](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L25)

##### standard\_rate

> **standard\_rate**: `number`

Defined in: [posapp/types/models.ts:11](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L11)

##### stock\_qty

> **stock\_qty**: `number`

Defined in: [posapp/types/models.ts:10](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L10)

##### uom

> **uom**: `string`

Defined in: [posapp/types/models.ts:12](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L12)

***

### Payment

Defined in: [posapp/types/models.ts:106](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L106)

A single payment line on an invoice (e.g. Cash, Card, Loyalty Points).

#### Indexable

> \[`key`: `string`\]: `any`

#### Properties

##### account?

> `optional` **account?**: `string`

Defined in: [posapp/types/models.ts:110](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L110)

##### amount

> **amount**: `number`

Defined in: [posapp/types/models.ts:109](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L109)

Payment amount in the invoice currency. Negative for return/refund rows.

##### base\_amount?

> `optional` **base\_amount?**: `number`

Defined in: [posapp/types/models.ts:112](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L112)

##### conversion\_rate?

> `optional` **conversion\_rate?**: `number`

Defined in: [posapp/types/models.ts:115](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L115)

##### currency?

> `optional` **currency?**: `string`

Defined in: [posapp/types/models.ts:114](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L114)

##### default?

> `optional` **default?**: `boolean`

Defined in: [posapp/types/models.ts:113](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L113)

##### mode\_of\_payment

> **mode\_of\_payment**: `string`

Defined in: [posapp/types/models.ts:107](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L107)

##### type?

> `optional` **type?**: `string`

Defined in: [posapp/types/models.ts:111](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L111)

***

### POSProfile

Defined in: [posapp/types/models.ts:137](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L137)

Key fields from the active POS Profile document.
The full profile carries many additional `posa_*` feature-flag fields; they are
accessible via `[key: string]: any`.

#### Indexable

> \[`key`: `string`\]: `any`

#### Properties

##### company

> **company**: `string`

Defined in: [posapp/types/models.ts:139](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L139)

##### currency

> **currency**: `string`

Defined in: [posapp/types/models.ts:140](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L140)

##### expense\_account

> **expense\_account**: `string`

Defined in: [posapp/types/models.ts:144](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L144)

##### income\_account

> **income\_account**: `string`

Defined in: [posapp/types/models.ts:143](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L143)

##### name

> **name**: `string`

Defined in: [posapp/types/models.ts:138](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L138)

##### selling\_price\_list

> **selling\_price\_list**: `string`

Defined in: [posapp/types/models.ts:142](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L142)

##### warehouse

> **warehouse**: `string`

Defined in: [posapp/types/models.ts:141](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L141)

***

### StoredCustomer

Defined in: [posapp/types/models.ts:173](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L173)

#### Extends

- [`CustomerSummary`](#customersummary)

#### Indexable

> \[`key`: `string`\]: `any`

#### Properties

##### customer\_name

> **customer\_name**: `string`

Defined in: [posapp/types/models.ts:166](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L166)

###### Inherited from

[`CustomerSummary`](#customersummary).[`customer_name`](#customer_name-1)

##### email\_id?

> `optional` **email\_id?**: `string`

Defined in: [posapp/types/models.ts:167](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L167)

###### Inherited from

[`CustomerSummary`](#customersummary).[`email_id`](#email_id-1)

##### mobile\_no?

> `optional` **mobile\_no?**: `string`

Defined in: [posapp/types/models.ts:168](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L168)

###### Inherited from

[`CustomerSummary`](#customersummary).[`mobile_no`](#mobile_no-1)

##### name

> **name**: `string`

Defined in: [posapp/types/models.ts:165](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L165)

###### Inherited from

[`CustomerSummary`](#customersummary).[`name`](#name-1)

##### primary\_address?

> `optional` **primary\_address?**: `string`

Defined in: [posapp/types/models.ts:169](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L169)

###### Inherited from

[`CustomerSummary`](#customersummary).[`primary_address`](#primary_address-1)

##### tax\_id?

> `optional` **tax\_id?**: `string`

Defined in: [posapp/types/models.ts:174](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L174)

***

### Tax

Defined in: [posapp/types/models.ts:122](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L122)

A tax/charge row applied to the invoice, matching the ERPNext Sales Taxes and Charges table.

#### Indexable

> \[`key`: `string`\]: `any`

#### Properties

##### account\_head?

> `optional` **account\_head?**: `string`

Defined in: [posapp/types/models.ts:124](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L124)

##### charge\_type?

> `optional` **charge\_type?**: `string`

Defined in: [posapp/types/models.ts:123](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L123)

##### description?

> `optional` **description?**: `string`

Defined in: [posapp/types/models.ts:128](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L128)

##### rate?

> `optional` **rate?**: `number`

Defined in: [posapp/types/models.ts:126](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L126)

Tax rate as a percentage (e.g. `15` for 15%).

##### tax\_amount?

> `optional` **tax\_amount?**: `number`

Defined in: [posapp/types/models.ts:127](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L127)

## Type Aliases

### CustomerInfo

> **CustomerInfo** = `Record`\<`string`, `unknown`\>

Defined in: [posapp/types/models.ts:177](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L177)

***

### PartialInvoiceDoc

> **PartialInvoiceDoc** = `Partial`\<[`InvoiceDoc`](#invoicedoc)\> & [`InvoiceDocRef`](#invoicedocref)

Defined in: [posapp/types/models.ts:101](https://github.com/defendicon/POS-Awesome-V15/blob/d9a10599774af31ef208b1b75faad95ebbf709ec/frontend/src/posapp/types/models.ts#L101)
