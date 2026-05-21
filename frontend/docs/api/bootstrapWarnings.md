[**posawesome-frontend**](README.md)

***

[posawesome-frontend](README.md) / bootstrapWarnings

# bootstrapWarnings

UI helpers for surfacing offline-prerequisite warnings to the operator.

These functions are deliberately free of Vue reactivity — they operate on plain
objects so they can be used in both component code and unit tests.

## Functions

### formatBootstrapWarning()

> **formatBootstrapWarning**(`code`, `translate?`): `string`

Defined in: [posapp/utils/bootstrapWarnings.ts:24](https://github.com/defendicon/POS-Awesome-V15/blob/6a7577621a096e30d3a54ef94f08df6b4d9cd53b/frontend/src/posapp/utils/bootstrapWarnings.ts#L24)

Maps a prerequisite warning code to a translated human-readable message.

Warning codes are produced by `resolveBootstrapRuntimeState` in
`offline/bootstrapSnapshot.ts`. The default `translate` identity function is used in
tests; production code passes the Frappe `__()` translator.

#### Parameters

##### code

`string`

A prerequisite key (e.g. `"pos_profile"`) or a mismatch reason
  (e.g. `"build_version_mismatch"`).

##### translate?

`TranslateFn` = `...`

Optional translation function; defaults to identity.

#### Returns

`string`

Translated user-facing message string.

***

### shouldShowBootstrapBanner()

> **shouldShowBootstrapBanner**(`status`): `boolean`

Defined in: [posapp/utils/bootstrapWarnings.ts:106](https://github.com/defendicon/POS-Awesome-V15/blob/6a7577621a096e30d3a54ef94f08df6b4d9cd53b/frontend/src/posapp/utils/bootstrapWarnings.ts#L106)

Returns `true` when the persisted bootstrap status warrants showing the offline warning
banner in the navbar.

Only `"limited"` (blocking prerequisites missing) and `"invalid"` (wrong user session)
modes trigger the banner. A `"normal"` or `"confirmation_required"` mode returns `false`.

#### Parameters

##### status

`Record`\<`string`, `any`\> \| `null` \| `undefined`

The `bootstrapStatus` object stored in `DefaultLayout.vue`, typically
  read from `getBootstrapSnapshotStatus()`.

#### Returns

`boolean`
