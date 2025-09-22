# POS Scanner Pipeline

This document describes the keyboard wedge scanner pipeline that powers the POS
Awesome frontend. The goal is predictable, lossless ingestion of high-throughput
barcode data without blocking the UI thread.

## Overview

The pipeline consists of three layers:

1. **Keyboard capture (`useScanner`)** – a global listener backed by a ring
   buffer and small finite state machine. It segments keystrokes into discrete
   frames using configurable prefix/suffix terminators, a tight inter-key timing
   heuristic, an idle timeout, and GTIN checksum validation with UPC→EAN
   normalisation. Debounced duplicates are ignored for 200 ms.
2. **Scan queue (`useScanQueue`)** – a FIFO queue that guarantees only one frame
   is processed at a time. Each frame is passed to the resolver and only after a
   successful cart mutation is the next scan dequeued.
3. **Resolver worker (`scannerWorker.js`)** – a Web Worker that performs all
   heavy parsing, greedy/backoff length detection, GS1 AI extraction, and
   barcode→item lookups against the IndexedDB cache. The worker normalises multi
   UOM barcodes, applies priority rules, and responds with deterministic
   resolution metadata.

The main thread only updates UI state and emits micro-toasts.

## Configuration

Scanner settings live under `pos_profile.scanner` and default to the following
values:

```jsonc
{
	"enabled": true,
	"prefix": "",
	"suffix": "Enter",
	"timeGapScannerMs": 25,
	"timeGapHumanMs": 80,
	"idleCloseMs": 80,
	"enableChecksumValidation": true,
	"normalizeUpcToEan13": true,
	"dedupCooldownMs": 200,
	"bulkMode": false,
	"feedbackToasts": true,
}
```

These can be exposed inside the POS Profile / App Settings form as:

| Setting                             | Description                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `scanner.enabled`                   | Master feature flag. Set to `false` to revert to manual entry.                   |
| `scanner.prefix` / `scanner.suffix` | Optional terminators (e.g. `^` or STX / `$` or ETX). Defaults to suffix = Enter. |
| `scanner.timeGapScannerMs`          | Keys closer than this (default 25 ms) are treated as scanner input.              |
| `scanner.timeGapHumanMs`            | Keys slower than this (default 80 ms) end the frame as human typing.             |
| `scanner.idleCloseMs`               | Idle timeout to auto-close frames missing a terminator.                          |
| `scanner.enableChecksumValidation`  | Validate EAN-8/13, UPC-A and ITF-14 check digits.                                |
| `scanner.normalizeUpcToEan13`       | Left-pad UPC-A with `0` before lookup.                                           |
| `scanner.dedupCooldownMs`           | Reject identical frames seen within the window.                                  |
| `scanner.bulkMode`                  | Reserved for future batching.                                                    |
| `scanner.feedbackToasts`            | Toggle success/error toasts.                                                     |

### Applying configuration

The POS front-end reads `pos_profile.scanner` and forwards the merged settings to
both the `useScanner` composable and the resolver worker. Runtime changes (for
example switching POS profiles) trigger a teardown + re-initialisation so the
new configuration takes effect immediately.

## Failure modes and diagnostics

- **Unknown barcode** – The worker returns no matches. The UI emits
  “Unknown barcode” toast with the captured value and keeps the scanner focused.
- **Checksum failure** – Frames with invalid GTIN check digits are discarded and
  logged when `window.DEBUG_SCANNER` is truthy.
- **Idle timeout** – Frames that stall longer than `idleCloseMs` close
  automatically, leaving the raw input in the error toast for copy/paste.
- **Duplicate flood** – The dedup hash prevents the same barcode from being
  processed more than once every 200 ms.

Enable `window.DEBUG_SCANNER = true` in the console (or set
`localStorage.DEBUG_SCANNER = 1`) to stream verbose diagnostics. Press **F1** in
development builds to open the diagnostics overlay which displays:

- Frame duration and inter-key histogram
- Symbology guess + decision path (terminator vs timeout vs length)
- Worker resolution metadata
- Current queue depth

A synthetic scan generator lives behind the same panel. Enter a payload, choose
an inter-key delay (1–10 ms for scanners, 80 ms+ for human), and mix scanner +
human characters to validate segmentation. Wrap sections in `{}` to mark them as
human-typed (they use the slower delay). Escapes such as `\n`, `\t`, `\{` and
`\}` are supported so you can include terminators and braces literally.

## GS1 / multi-UOM policy

The worker supports the following symbologies:

- UPC-A (normalised to EAN-13 when enabled)
- EAN-8, EAN-13, ITF-14
- Code-39 / Code-128 (falls back to timeout/terminator boundaries)
- GS1-128 with basic AIs (01/02 GTIN, 10 batch, 17 expiry)

Multi-UOM priority order:

1. Explicit barcode-level UOM (`posa_uom` or `uom` on `Item Barcode`)
2. Item default UOM (stock UOM)
3. Fallback (future configurable rule)

For each resolved item the worker returns `conversion_factor`, `pack_size`
(if available), and the originating source. The main thread uses this metadata
while adding the row and updates price/UOM in a single atomic transaction.

## Serial / HID adapters

The architecture anticipates Web Serial / Web HID support under
`scanner-adapters/serial.ts` and `scanner-adapters/hid.ts`. These modules are not
enabled by default, but the worker and queue are protocol-agnostic—additional
adapters only need to push frames into `useScanQueue`.

## Performance tips

- Seeding: the worker indexes the first 1,000 items immediately and lazily
  warms the rest during idle periods. Use the Offline cache to persist barcode
  metadata so the worker starts with a warm map.
- UI work stays on the microtask queue—cart updates, totals recomputation, and
  virtualised lists are batched so the main thread remains under 50 ms p95.
- Scanner-only mode (F9) blurs optional inputs and returns focus to the hidden
  capture input. Inactivity for 2 s exits the mode.

## Manual QA checklist

1. Scan 500 mixed barcodes (EAN-13, UPC-A, ITF-14, Code-128) rapidly.
    - No lost frames, cart order preserved, UI remains responsive.
2. Type in the search field while scanning in parallel. Human typing should be
   unaffected and scans still resolve.
3. Toggle UPC normalisation and confirm UPC-A resolves both as 12-digit and
   zero-padded EAN-13 when enabled.
4. Verify multi-UOM barcodes add the correct UOM/price; repeated scans increment
   quantity rather than duplicate lines.
5. Disconnect from the network and confirm lookups succeed using the local
   IndexedDB cache.
6. Trigger error states: unknown barcode, checksum failure, idle timeout. Ensure
   toasts show the captured value and the scanner resumes automatically.
