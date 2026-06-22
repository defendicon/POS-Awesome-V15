# Persistence Write Batching Design

## Problem

`persist()` currently JSON serializes and parses every worker-bound value before
`postMessage()` performs another structured clone. Each call also becomes an
independent IndexedDB `put()`. Large cache snapshots and bursts of related cache
updates therefore create avoidable CPU, allocation, message, transaction, and
write amplification.

The worker path also attempts to update `localStorage`, but dedicated workers do
not expose `localStorage`. Lightweight boot mirrors must remain owned by the main
thread.

## Design

`persist()` remains the single synchronous notification API used by cache and
legacy queue snapshots. It will:

1. Mark the memory key as changed.
2. Apply the existing main-thread `localStorage` mirror policy immediately.
3. Queue IndexedDB-eligible values in a per-key map.
4. Schedule one microtask flush.

The map is latest-write-wins within a pending batch. A flush sends one
`persist_batch` worker message when the persistence worker is healthy. Native
`postMessage()` structured cloning replaces the JSON stringify/parse clone.

When no worker is available, the same batch is grouped by physical Dexie table.
Each table receives one `bulkPut()` inside a serialized write chain. A failed
bulk write uses the existing row-by-row fallback path.

The worker will await its database initialization, serialize incoming batches,
group entries by table, and use `bulkPut()` once per table. It will send a batch
acknowledgement or failure. After a worker system error, timeout, or rejected
batch, all in-flight batches are replayed through the serialized direct fallback
in dispatch order so newer state cannot be replaced by stale state.

## Correctness Contracts

- Public `persist(key, value?)` remains synchronous and fire-and-forget.
- The latest queued value for a key wins.
- Flushes are serialized so an older direct batch cannot finish after a newer
  direct batch.
- IndexedDB routing continues to use `KEY_TABLE_MAP`.
- `customer_storage` remains memory-only.
- Only `LOCAL_STORAGE_KEYS` are mirrored, and large keys remain excluded.
- Durable `write_queue` and `invoice_outbox` transactions are unchanged.
- Native structured-clone-compatible values, including `Date`, retain their
  type instead of being JSON-normalized.

## Verification

- Main-thread batches coalesce repeated keys.
- Worker messages use `persist_batch`, with no JSON clone.
- Worker source groups writes and uses `bulkPut()`.
- Worker-less fallback groups writes by table and preserves flush order.
- Worker failure switches to direct fallback and requeues latest values.
- Local storage mirrors remain correct with and without a worker.
- Existing offline cache, queue, outbox, startup hydration, type-check, lint,
  and production build checks pass.
