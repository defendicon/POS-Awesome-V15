/** Render the actual Retail components without requiring a Frappe database. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const name = `.retail-check-${randomUUID()}`;
const htmlPath = path.join(root, `${name}.html`);
const vuePath = path.join(root, `${name}.vue`);
const output = path.join(tmpdir(), "posawesome-pr3167-layout");
let server;
let browser;

try {
	await mkdir(output, { recursive: true });
	await writeFile(htmlPath, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body data-route="posapp"><div id="app"></div>
<script>document.documentElement.dir=sessionStorage.getItem("retail-check-rtl")==="1"?"rtl":"ltr";window.__=s=>s;window.frappe={_:s=>s,session:{user:'cashier@example.com',user_fullname:'Test Cashier'},boot:{sysdefaults:{currency:'USD'},user:{desk_theme:'Light'}},utils:{is_rtl:()=>document.documentElement.dir==='rtl'},ui:{set_theme:()=>{}},call:async()=>({message:[]})};</script>
<script type="module">import {createApp} from 'vue';import {createPinia} from 'pinia';import App from './${name}.vue';import vuetify from '/src/posapp/plugins/vuetify.ts';const app=createApp(App);app.config.globalProperties.__=window.__;app.config.globalProperties.frappe=window.frappe;app.config.globalProperties.$theme={isDark:false};vuetify.locale.current.value=document.documentElement.dir==='rtl'?'ar':'en';app.use(createPinia()).use(vuetify).mount('#app');</script></body></html>`);
	await writeFile(vuePath, `<script setup>
import {computed,ref,onMounted,onBeforeUnmount} from 'vue';
import 'vuetify/styles';
import '/src/posapp/styles/theme.css';
import '/src/posapp/styles/retail.css';
import '/src/posapp/styles/retail-template.css';
import Navbar from '/src/posapp/components/navbar/NavbarAppBar.vue';
import ItemHeader from '/src/posapp/components/pos/items/ItemHeader.vue';
import Filters from '/src/posapp/components/pos/items/RetailItemFilters.vue';
import ItemCard from '/src/posapp/components/pos/items/ItemCard.vue';
import Cart from '/src/posapp/components/pos/invoice/RetailCartList.vue';
import Summary from '/src/posapp/components/pos/invoice/InvoiceSummary.vue';
import CardLayout from '/src/posapp/components/pos/invoice/InvoiceCardLayout.vue';
import Workspace from '/src/posapp/components/ui/WorkspaceCustomizer.vue';
import {resolvePosUiTemplate} from '/src/posapp/utils/posUiTemplate.ts';
import {useUIStore} from '/src/posapp/stores/uiStore';
const profile={name:'Main POS',currency:'USD',posa_ui_template:'POS Awesome Retail',posa_allow_return:1,posa_allow_user_to_edit_additional_discount:1,posa_allow_print_draft_invoices:1,posa_enable_camera_scanning:1};
useUIStore().posOpeningShift={name:'SHIFT-001'};
const width=ref(innerWidth);const resize=()=>width.value=innerWidth;
onMounted(()=>addEventListener('resize',resize));onBeforeUnmount(()=>removeEventListener('resize',resize));
const retail=computed(()=>resolvePosUiTemplate(profile,width.value).effectiveTemplate==='POS Awesome Retail');
const items=ref([{item_code:'A',item_name:'Chocolate Cake',qty:2,rate:12,amount:24,actual_qty:10,stock_uom:'Nos'},{item_code:'B',item_name:'Shirt XL',qty:1,rate:8,amount:8,actual_qty:2,stock_uom:'Nos'}]);
const catalog=items.value.map(item=>({...item}));
const total=computed(()=>items.value.reduce((sum,item)=>sum+item.qty*item.rate,0));
const money=value=>Number(value||0).toFixed(2);const float=(value,p=2)=>Number(value||0).toFixed(p);
const plus=item=>{item.qty++;item.amount=item.qty*item.rate;};const minus=item=>{item.qty--;item.amount=item.qty*item.rate;};const remove=item=>items.value.splice(items.value.indexOf(item),1);
const discount=ref(0);const group=ref('ALL');const view=ref('card');const search=ref('');const qty=ref(1);const paid=ref(0);
</script>
<template><v-app><Navbar :pos-profile="profile" cashier-name="Test Cashier"/><v-main><Workspace/>
<div class="pos-main-container" :class="{'pos-main-container--retail':retail}">
<v-row class="dynamic-main-row" :class="{'retail-main-row':retail}">
<v-col class="dynamic-col--selector" cols="8"><div class="items-selector-shell"><v-card class="selection-card"><div class="dynamic-padding"><v-card class="selector-header-card"><ItemHeader variant="retail" :pos-profile="profile" v-model:search-input="search" v-model:qty-input="qty"/><Filters v-model="group" v-model:items-view="view" :items-group="['ALL','Food','Clothing']" :total-count="2" active-price-list="Standard Selling"/></v-card><v-card class="selector-results-card"><div class="sample-products"><ItemCard v-for="item in catalog" :key="item.item_code" variant="retail" :item="item" :pos-profile="profile" :cart-qty="items.find(row=>row.item_code===item.item_code)?.qty||0" :get-item-rate-info="()=>({})" :currency-symbol="()=>'$'" :format-currency="money" :format-number="float" :rate-precision="()=>2" @click="plus(items.find(row=>row.item_code===item.item_code))"/></div></v-card></div></v-card></div></v-col>
<v-col class="dynamic-col--invoice" cols="4"><div class="invoice-shell"><v-card class="invoice-main-card"><div class="dynamic-padding"><div class="retail-sale-head"><strong class="retail-sale-head__number">New sale</strong><span class="retail-badge retail-badge--info">Saved as Sales Invoice</span></div><CardLayout user="cashier" :profile="profile.name" :enabled="['customer','items']"><template #customer><v-card class="invoice-section-card"><v-text-field label="Customer" model-value="Walk-in Customer"/></v-card></template><template #items><v-card class="invoice-section-card"><Cart :items="items" :format-currency="money" :format-float="float" :add-one="plus" :subtract-one="minus" :remove-item="remove"/></v-card></template></CardLayout></div></v-card><Summary layout-user="cashier" :presentation="retail?'retail':'classic'" :pos_profile="profile" :total_qty="3" v-model:additional_discount="discount" :total_items_discount_amount="0" :gross-total="total" :subtotal="total-discount" display-currency="USD" :format-float="float" :format-currency="money" :currency-symbol="()=>'$'" :is-number="()=>true" @show-payment="paid++"/><span data-paid>{{paid}}</span></div></v-col>
</v-row></div></v-main></v-app></template>
<style scoped>.dynamic-main-row{margin:0}.sample-products{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:14px}.sample-products .retail-card{height:168px}.invoice-shell{min-width:0}.dynamic-col--invoice .invoice-main-card .dynamic-padding{padding:18px}.retail-sale-head{margin-bottom:16px}body{margin:0}</style>`);
	server = await createServer({ configFile: false, root, plugins: [vue()], server: { host: "127.0.0.1", port: 0 } });
	await server.listen();
	const address = server.httpServer.address();
	browser = await chromium.launch({ headless: true, ...(process.env.POSA_BROWSER_CHANNEL ? { channel: process.env.POSA_BROWSER_CHANNEL } : {}) });
	for (const [width, height, dark, rtl] of [[1440, 900, false, false], [1366, 768, true, true], [1100, 768, false, false], [1024, 768, false, false]]) {
		const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
		const errors = [];
		page.on("pageerror", error => errors.push(error.message));
		await page.addInitScript(({ dark, rtl }) => {
			localStorage.setItem("posawesome_theme_preference", dark ? "dark" : "light");
			sessionStorage.setItem("retail-check-rtl", rtl ? "1" : "0");
		}, { dark, rtl });
		await page.goto(`http://127.0.0.1:${address.port}/${name}.html`);
		await page.locator('[data-testid="invoice-action-pay"]').waitFor();
		await page.evaluate(() => document.fonts.ready);
		assert.deepEqual(errors, [], "component render errors");
		assert.equal(await page.title(), "POS Awesome");
		assert.equal(await page.locator(".rtl-app-bar").count(), rtl ? 1 : 0);
		assert.equal(await page.locator('[data-testid="retail-summary"]').count(), width >= 1100 ? 1 : 0);
		const overflow = await page.evaluate(() => ({ actual: document.documentElement.scrollWidth, expected: innerWidth }));
		if (overflow.actual > overflow.expected + 1) console.log(await page.evaluate(() => [...document.querySelectorAll("body *")].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,cls:el.className,right:el.getBoundingClientRect().right})).slice(0,15)));
		assert.ok(overflow.actual <= overflow.expected + 1, JSON.stringify({ width, overflow }));
		if (width >= 1100) {
			assert.equal(await page.locator(".retail-pay").evaluate(el=>getComputedStyle(el).backgroundColor), "rgb(247, 143, 30)");
			await page.locator('[data-testid="retail-plus-A"]').click();
			assert.match(await page.locator('.retail-totals__due-amount').innerText(), /44.00/);
			await page.locator('[data-testid="retail-minus-B"]').click();
			assert.equal(await page.locator('[data-testid="retail-line-B"]').count(), 0);
			const input = page.locator('.retail-discount-input input');
			await input.fill("5");
			await input.blur();
			assert.match(await page.locator('.retail-totals__due-amount').innerText(), /31.00/);
		}
		await page.locator('[data-testid="invoice-action-pay"]').click();
		assert.equal(await page.locator('[data-paid]').innerText(), "1");
		await page.screenshot({ path: path.join(output, `${width}-${dark ? "dark" : "light"}-${rtl ? "rtl" : "ltr"}.png`), fullPage: true });
		console.log(`PASS ${width}x${height} ${dark ? "dark" : "light"} ${rtl ? "RTL" : "LTR"}: brand, overflow, cart, discounts, payment`);
		await page.close();
	}
	console.log(`Screenshots: ${output}`);
} finally {
	await browser?.close();
	await server?.close();
	await Promise.all([htmlPath, vuePath].map(file => unlink(file).catch(error => { if (error.code !== "ENOENT") throw error; })));
}
