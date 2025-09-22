const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { parse } = require('@vue/compiler-sfc');

const filePath = path.join(__dirname, '..', 'frontend/src/posapp/components/pos/ItemsSelector.vue');
const source = fs.readFileSync(filePath, 'utf8');
const { descriptor } = parse(source, { filename: filePath });

if (!descriptor || !descriptor.script || !descriptor.script.content) {
  throw new Error('Unable to extract script content from ItemsSelector.vue');
}

const scriptContent = descriptor.script.content;
const cleaned = scriptContent
  .replace(/^import[^;]+;\n/gm, '')
  .replace(/export default/, 'module.exports =');

const stubbedPreamble = `
const format = {};
const _ = require('lodash');
const ensurePosProfile = async () => ({});
const CameraScanner = {};
const useResponsive = () => ({ responsiveStyles: {}, rtlClasses: '' });
const useRtl = () => ({ rtlClasses: '' });
const useFlyAnimation = () => ({ fly: () => {} });
const placeholderImage = '';
const Skeleton = {};
const saveItemUOMs = () => {};
const getItemUOMs = () => Promise.resolve([]);
const getLocalStock = () => Promise.resolve([]);
const isOffline = () => false;
const getStoredItemsCount = () => Promise.resolve(0);
const initializeStockCache = () => Promise.resolve();
const searchStoredItems = () => Promise.resolve([]);
const saveItemsBulk = () => Promise.resolve();
const saveItems = () => Promise.resolve();
const clearStoredItems = () => Promise.resolve();
const getLocalStockCache = () => Promise.resolve([]);
const setLocalStockCache = () => Promise.resolve();
const initPromise = Promise.resolve();
const memoryInitPromise = Promise.resolve();
const checkDbHealth = () => Promise.resolve(true);
const getCachedPriceListItems = () => Promise.resolve([]);
const savePriceListItems = () => Promise.resolve();
const clearPriceListCache = () => Promise.resolve();
const updateLocalStockCache = () => Promise.resolve();
const isStockCacheReady = () => Promise.resolve(true);
const getCachedItemDetails = () => Promise.resolve(null);
const saveItemDetailsCache = () => Promise.resolve();
const saveItemGroups = () => Promise.resolve();
const getCachedItemGroups = () => Promise.resolve([]);
const getItemsLastSync = () => Promise.resolve(null);
const setItemsLastSync = () => Promise.resolve();
const forceClearAllCache = () => Promise.resolve();
`;

const moduleCode = `${stubbedPreamble}\n${cleaned}`;

const sandbox = {
  module: { exports: {} },
  exports: {},
  require,
  console,
  setTimeout,
  clearTimeout,
  Intl,
  __: (value) => value,
  frappe: {
    __: (value) => value,
    call: () => Promise.resolve(),
    msgprint: () => {},
  },
};

sandbox.global = sandbox;
sandbox.window = {};
sandbox.document = {};
sandbox.navigator = {};

vm.createContext(sandbox);

try {
  const script = new vm.Script(moduleCode, { filename: 'ItemsSelector.js' });
  script.runInContext(sandbox);
} catch (error) {
  console.error('Failed to evaluate component script:', error);
  process.exit(1);
}

const component = sandbox.module.exports;
if (!component) {
  throw new Error('Component export not found');
}

const data = typeof component.data === 'function' ? component.data() : {};
const instance = { ...data };
instance.__ = sandbox.__;
instance.frappe = sandbox.frappe;

const handledCodes = [];
const enqueuedCodes = [];
const failures = [];

const bindMethod = (name, fn) => {
  if (typeof fn === 'function') {
    instance[name] = function boundMethod(...args) {
      return fn.apply(instance, args);
    };
  }
};

if (component.methods && typeof component.methods === 'object') {
  Object.entries(component.methods).forEach(([name, fn]) => {
    bindMethod(name, fn);
  });
}

instance.notifyHardwareScanFailure = function (code, payload) {
  failures.push({ code, payload });
};

instance.playScanTone = () => {};

instance.processHardwareScanQueue = function () {
  while (this.hardwareScanQueue.length) {
    const next = this.hardwareScanQueue.shift();
    if (next && next.code) {
      enqueuedCodes.push(next.code);
    }
    this.handleHardwareScan(next);
  }
};

instance.handleHardwareScan = async function ({ code }) {
  handledCodes.push(code);
  return true;
};

instance.getCompositeBarcodeLengthFailureDetails = () => 'stub';

instance.splitRepeatedScanSegment = function (segment) {
  return segment ? [segment] : [];
};
instance.splitSegmentBySequentialStandardLengths = () => null;
instance.splitSegmentByKnownCodes = () => null;
instance.splitSegmentByHintedLengths = () => null;
instance.splitSegmentByProgressiveBarcodeTypes = () => null;

instance.scanErrorDialog = false;
instance.processingHardwareScan = true;
instance.currentHardwareScan = { code: 'ABC123' };
instance.lastCompositeNormalization = { attempted: false, success: false, reason: '' };

instance.trigger_onscan('ABC123XYZ456');

if (!enqueuedCodes.length) {
  throw new Error('No codes were enqueued by trigger_onscan');
}

console.log('Enqueued codes:', enqueuedCodes);
console.log('Handled codes:', handledCodes);
console.log('Failures:', failures);

if (handledCodes.includes('ABC123XYZ456')) {
  throw new Error('Combined payload was processed by handleHardwareScan');
}

if (!enqueuedCodes.includes('XYZ456')) {
  throw new Error('Expected remainder barcode to be enqueued');
}

console.log('Merged scan fallback behaved as expected.');

