/** Render the actual Retail components without requiring a Frappe database. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile, readFile, unlink, mkdir } from "node:fs/promises";
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
<script>document.documentElement.dir=sessionStorage.getItem("retail-check-rtl")==="1"?"rtl":"ltr";window.__=s=>s;window.frappe={_:s=>s,datetime:{nowdate:()=>"2026-11-24",get_today:()=>"2026-11-24"},defaults:{get_user_default:()=>'',get_default:()=>''},db:{get_list:async()=>[],get_value:async()=>({message:{}})},session:{user:'cashier@example.com',user_fullname:'Test Cashier'},boot:{sysdefaults:{currency:'USD'},user:{desk_theme:'Light'}},utils:{is_rtl:()=>document.documentElement.dir==='rtl'},ui:{set_theme:()=>{}},call:async()=>({message:[]})};</script>
<script type="module">import {createApp} from 'vue';import {createPinia} from 'pinia';import App from './${name}.vue';import vuetify from '/src/posapp/plugins/vuetify.ts';import VueDatePicker from '@vuepic/vue-datepicker';import '@vuepic/vue-datepicker/dist/main.css';const app=createApp(App);app.config.globalProperties.__=window.__;app.config.globalProperties.frappe=window.frappe;app.config.globalProperties.$theme={isDark:false};vuetify.locale.current.value=document.documentElement.dir==='rtl'?'ar':'en';app.component('VueDatePicker',VueDatePicker);app.config.globalProperties.eventBus={on:()=>{},off:()=>{},emit:()=>{}};app.use(createPinia()).use(vuetify).mount('#app');</script></body></html>`);
	const invoiceSource = await readFile(path.join(root, 'src/posapp/components/pos/Invoice.vue'), 'utf8');
 const invoiceShellStyles = ['invoice-shell', 'invoice-main-card', 'dynamic-padding', 'invoice-sections', 'invoice-section-card', 'invoice-items-card', 'items-table-wrapper'].map(selector => invoiceSource.match(new RegExp('^\\.' + selector + ' \\{[^}]*\\}', 'm'))?.[0] || '').join('\n');
 await writeFile(vuePath, `<script setup>
import {computed,ref,onMounted,onBeforeUnmount,reactive} from 'vue';
import 'vuetify/styles';
import '/src/posapp/styles/theme.css';
import '/src/posapp/styles/retail.css';
import '/src/posapp/styles/retail-template.css';
import Navbar from '/src/posapp/components/navbar/NavbarAppBar.vue';
import ItemHeader from '/src/posapp/components/pos/items/ItemHeader.vue';
import Filters from '/src/posapp/components/pos/items/RetailItemFilters.vue';
import ItemCard from '/src/posapp/components/pos/items/ItemCard.vue';
import Cart from '/src/posapp/components/pos/invoice/ItemsTable.vue';
import {useInvoiceStore} from '/src/posapp/stores/invoiceStore';
import Summary from '/src/posapp/components/pos/invoice/InvoiceSummary.vue';
import CardLayout from '/src/posapp/components/pos/invoice/InvoiceCardLayout.vue';
import CustomerSection from '/src/posapp/components/pos/invoice/InvoiceCustomerSection.vue';
import Posting from '/src/posapp/components/pos/invoice/PostingDateRow.vue';
import {useCustomersStore} from '/src/posapp/stores/customersStore';
import {workspaceCustomization} from '/src/posapp/composables/core/workspaceCustomization';
import Workspace from '/src/posapp/components/ui/WorkspaceCustomizer.vue';
import {resolvePosUiTemplate} from '/src/posapp/utils/posUiTemplate.ts';
import {useUIStore} from '/src/posapp/stores/uiStore';
const customerStore=useCustomersStore();customerStore.searchCustomers=async()=>{};customerStore.queueSearch=async()=>{};customerStore.customers=[{name:'CUST-001',customer_name:'Walk-in Customer'}];customerStore.customersLoaded=true;customerStore.selectedCustomer='CUST-001';
const profile=reactive({posa_allow_sales_order:1,posa_allow_change_posting_date:1,posa_show_customer_balance:1,name:'Main POS',currency:'USD',posa_ui_template:'POS Awesome Retail',posa_allow_return:1,posa_allow_user_to_edit_additional_discount:1,posa_allow_print_draft_invoices:1,posa_enable_camera_scanning:1});
useUIStore().posOpeningShift={name:'SHIFT-001'};
const direction=document.documentElement.dir;const width=ref(innerWidth);const resize=()=>width.value=innerWidth;
onMounted(()=>addEventListener('resize',resize));onBeforeUnmount(()=>removeEventListener('resize',resize));
const retail=computed(()=>resolvePosUiTemplate(profile,width.value).effectiveTemplate==='POS Awesome Retail');
const invoiceStore=useInvoiceStore();
invoiceStore.setItems([{item_code:'A',item_name:'Chocolate Cake',qty:2,rate:12,amount:24,actual_qty:10,stock_uom:'Nos',uom:'Nos',item_uoms:[{uom:'Nos'},{uom:'Box'}]},{item_code:'B',item_name:'Shirt XL',qty:1,rate:8,amount:8,actual_qty:2,stock_uom:'Nos',uom:'Nos',item_uoms:[{uom:'Nos'},{uom:'Box'}]}]);
const items=computed(()=>invoiceStore.items);
const catalog=items.value.map(item=>({...item}));
const sampleItems=items.value.map(item=>({...item}));
window.__retailCheck={openCards:()=>workspaceCustomization.open("cards"),apply:()=>workspaceCustomization.apply(),cancel:()=>workspaceCustomization.cancel(),setProfile:(flags)=>Object.assign(profile,flags),setRows:(count)=>{invoiceStore.setItems(Array.from({length:count},(_,i)=>i<2?{...sampleItems[i]}:{...sampleItems[0],posa_row_id:'retail-'+i,item_code:'ITEM-'+i,item_name:'Product '+(i+1),qty:1,amount:12}));}};
window.__retailCheck.setRows(12);
const total=computed(()=>items.value.reduce((sum,item)=>sum+item.qty*item.rate,0));
const money=value=>Number(value||0).toFixed(2);const float=(value,p=2)=>Number(value||0).toFixed(p);
const plus=item=>{item.qty++;item.amount=item.qty*item.rate;};const minus=item=>{item.qty--;item.amount=item.qty*item.rate;};const remove=item=>invoiceStore.removeItemByRowId(item.posa_row_id);
const postingDate=ref('24-11-2026');const invoiceType=ref('Invoice');const discount=ref(0);const group=ref('ALL');const view=ref('card');const search=ref('');const qty=ref(1);const paid=ref(0);
</script>
<template><v-app><Navbar :pos-profile="profile" cashier-name="Test Cashier"/><v-main><Workspace/>
<div class="pos-main-container" :style="{direction}" :class="{'pos-main-container--retail':retail}">
<v-row class="dynamic-main-row" :class="{'retail-main-row':retail}">
<v-col class="dynamic-col--selector" cols="8"><div class="items-selector-shell"><v-card class="selection-card"><div class="dynamic-padding"><v-card class="selector-header-card"><ItemHeader variant="retail" :pos-profile="profile" v-model:search-input="search" v-model:qty-input="qty"/><Filters v-model="group" v-model:items-view="view" :items-group="['ALL','Food','Clothing']" :total-count="2" active-price-list="Standard Selling"/></v-card><v-card class="selector-results-card"><div class="sample-products"><ItemCard v-for="item in catalog" :key="item.item_code" variant="retail" :item="item" :pos-profile="profile" :cart-qty="items.find(row=>row.item_code===item.item_code)?.qty||0" :get-item-rate-info="()=>({})" :currency-symbol="()=>'$'" :format-currency="money" :format-number="float" :rate-precision="()=>2" @click="plus(items.find(row=>row.item_code===item.item_code))"/></div></v-card></div></v-card></div></v-col>
<v-col class="dynamic-col--invoice" cols="4"><div class="invoice-shell" :class="{'invoice-shell--retail':retail}"><v-card class="invoice-main-card"><div class="dynamic-padding"><div class="retail-sale-head"><div class="retail-sale-head__copy"><span class="retail-eyebrow">Current sale</span><strong class="retail-sale-head__number">New sale</strong></div><span class="retail-badge retail-badge--info">Saved as Sales Invoice</span></div><CardLayout class="invoice-sections" user="cashier" :profile="profile.name" :compact="retail" :enabled="['customer','posting','items']"><template #customer><v-card class="invoice-section-card"><CustomerSection :compact="retail" :pos_profile="profile" v-model="invoiceType"/></v-card></template><template #posting><v-card class="invoice-section-card"><Posting :compact="retail" :pos_profile="profile" v-model:posting_date_display="postingDate" :customer_balance="0" :format-currency="money"/></v-card></template><template #items><v-card class="invoice-section-card invoice-items-card"><div class="items-table-wrapper" :class="{'items-table-wrapper--retail':retail}"><Cart :presentation="retail?'retail':'classic'" :headers="[{key:'item_name',title:'Name'},{key:'qty',title:'Qty'},{key:'rate',title:'Rate'},{key:'amount',title:'Amount'},{key:'actions',title:'Actions'}]" :pos_profile="profile" :format-currency="money" :format-float="float" :currency-symbol="()=>'$'" :is-number="()=>true" :is-negative="v=>v&lt;0" :add-one="plus" :subtract-one="minus" :remove-item="remove" :set-formated-qty="(item,field,v,force,value)=>{item[field]=Number(value);item.amount=item.qty*item.rate;}" :set-formated-currency="(item,field,v,force,event)=>item[field]=Number(event.target.value)" :calc-prices="item=>item.amount=item.qty*item.rate" :calc-uom="(item,uom)=>item.uom=uom" :set-serial-no="()=>{}" :set-batch-qty="()=>{}" :validate-due-date="()=>{}" :toggle-offer="()=>{}" :change-price-list-rate="()=>{}"/></div></v-card></template></CardLayout></div></v-card><Summary layout-user="cashier" :presentation="retail?'retail':'classic'" :pos_profile="profile" :total_qty="3" v-model:additional_discount="discount" :total_items_discount_amount="0" :gross-total="total" :subtotal="total-discount" display-currency="USD" :format-float="float" :format-currency="money" :currency-symbol="()=>'$'" :is-number="()=>true" @show-payment="paid++"/><span hidden data-posting-date>{{postingDate}}</span><span hidden data-paid>{{paid}}</span></div></v-col>
</v-row></div></v-main></v-app></template>
<style scoped>${invoiceShellStyles}
.dynamic-main-row{margin:0}.sample-products{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:14px}.sample-products .retail-card{height:168px}.invoice-shell{min-width:0}body{margin:0}</style>`);
	server = await createServer({ configFile: false, root, plugins: [vue()], server: { host: "127.0.0.1", port: 0 } });
	await server.listen();
	const address = server.httpServer.address();
	browser = await chromium.launch({ headless: true, ...(process.env.POSA_BROWSER_CHANNEL ? { channel: process.env.POSA_BROWSER_CHANNEL } : {}) });
	for (const [width, height, dark, rtl, customized] of [[1920, 914, false, false, true], [1440, 900, false, false], [1366, 768, true, true, true], [1100, 768, false, false], [1024, 768, false, false]]) {
		const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
		const errors = [];
		page.on("pageerror", error => { errors.push(error.message); console.error("Browser error:",error.message); });
		page.on("console", message => {if(message.type()==="error")console.error(message.text());});
		await page.addInitScript(({ dark, rtl, customized }) => {
			localStorage.setItem("posawesome_theme_preference", dark ? "dark" : "light");
			sessionStorage.setItem("retail-check-rtl", rtl ? "1" : "0");
		if(customized) localStorage.setItem('posawesome:invoice-cards:v1:["cashier","Main POS"]',JSON.stringify([{id:"customer",width:6.25},{id:"posting",width:5.75},{id:"items",width:"full"}]));
		}, { dark, rtl, customized });
		await page.goto(`http://127.0.0.1:${address.port}/${name}.html`, {waitUntil:"domcontentloaded"});
		await page.locator('[data-testid="invoice-action-pay"]').waitFor({timeout:10000});
		await page.evaluate(() => document.fonts.ready);
		assert.deepEqual(errors, [], "component render errors");
		assert.equal(await page.title(), "POS Awesome");
		assert.equal(await page.locator(".rtl-app-bar").count(), rtl ? 1 : 0);
		assert.equal(await page.locator('[data-testid="retail-summary"]').count(), width >= 1100 ? 1 : 0);
		const overflow = await page.evaluate(() => ({ actual: document.documentElement.scrollWidth, expected: innerWidth }));
		if (overflow.actual > overflow.expected + 1) console.log(await page.evaluate(() => [...document.querySelectorAll("body *")].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,cls:el.className,right:el.getBoundingClientRect().right})).slice(0,15)));
		assert.ok(overflow.actual <= overflow.expected + 1, JSON.stringify({ width, overflow }));
		if (width >= 1100) {
            const density = await page.evaluate(() => {
                const panel=document.querySelector('.invoice-main-card').getBoundingClientRect();
                const rows=[...document.querySelectorAll('.posa-cart-item-row--retail')].map(row=>row.getBoundingClientRect());
                return { visible:rows.filter(row=>row.top>=panel.top && row.bottom<=panel.bottom).length, panel:panel.height, summary:document.querySelector('.retail-summary').getBoundingClientRect().height, row:rows[0].height };
            });
            console.log('Cart density', width, density);
            assert.ok(density.visible >= (width >= 1920 ? 6 : width >= 1440 ? 5 : 3), 'Too few visible cart rows: '+JSON.stringify({width,density}));
            await page.screenshot({path:path.join(output,width+'-density.png'),fullPage:true});
            if (customized) {
                await page.evaluate(()=>window.__retailCheck.openCards());
                const card=page.locator('[data-invoice-card="customer"]');
                const handle=page.locator('[aria-label="Resize card: Customer Details"]');
                await handle.waitFor();
                await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
                const original=await card.evaluate(el=>el.getBoundingClientRect().width);
                const gridRtl=await card.evaluate(el=>getComputedStyle(el.parentElement).direction==='rtl');
                assert.equal(gridRtl,rtl);
                await handle.press(gridRtl?'ArrowLeft':'ArrowRight');

                await page.waitForFunction(({original})=>Math.abs(document.querySelector('[data-invoice-card="customer"]').getBoundingClientRect().width-original-1)<0.2,{original});
                const box=await handle.boundingBox();
                await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
                await page.mouse.down();
                await page.mouse.move(box.x+box.width/2+(rtl?-1:1),box.y+box.height/2);
                await page.mouse.up();
                await page.waitForFunction(({original})=>Math.abs(document.querySelector('[data-invoice-card="customer"]').getBoundingClientRect().width-original-2)<0.2,{original});
                await page.evaluate(()=>window.__retailCheck.apply());
                const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('posawesome:invoice-cards:v1:["cashier","Main POS"]')));
                assert.ok(saved.find(card=>card.id==='customer').width>6.25,'fractional resize was not persisted');
                await page.evaluate(()=>window.__retailCheck.openCards());
                await handle.press(rtl?'ArrowLeft':'ArrowRight');
                await page.evaluate(()=>window.__retailCheck.cancel());
                await page.waitForFunction(({original})=>Math.abs(document.querySelector('[data-invoice-card="customer"]').getBoundingClientRect().width-original-2)<0.2,{original});
                console.log('PASS one-pixel pointer/keyboard resize and Apply/Cancel',rtl?'RTL':'LTR');
            }

            await page.locator('.pos-date-picker input').click();
            await page.locator('.dp__cell_inner').filter({hasText:/^25$/}).first().click();
            assert.equal(await page.locator('[data-posting-date]').innerText(),'25-11-2026');
            await page.evaluate(()=>window.__retailCheck.setRows(2));
            await page.waitForFunction(()=>document.querySelectorAll('.posa-cart-item-row--retail').length===2);
			assert.equal(await page.locator(".retail-pay").evaluate(el=>getComputedStyle(el).backgroundColor), "rgb(247, 143, 30)");
			await page.locator('[data-testid="cart-row-A"] button[aria-label="Increase quantity"]').click();
			assert.match(await page.locator('.retail-totals__due-amount').innerText(), /44.00/);
			await page.locator('[data-testid="cart-row-B"] button[aria-label="Decrease quantity"]').click();
			assert.equal(await page.locator('[data-testid="cart-row-B"]').count(), 0);
			const input = page.locator('.retail-discount-input input');
			await input.fill("5");
			await input.blur();
			assert.match(await page.locator('.retail-totals__due-amount').innerText(), /31.00/);
			const row = page.locator('[data-testid="cart-row-A"]');
			assert.equal(await page.locator('.posa-cart-table').count(), 0, 'Retail must stay in cards');
			await row.locator('[aria-label="Edit rate"]').dispatchEvent('click');
			assert.equal(await row.locator('[data-column-key="rate"] input').count(), 0);
			await page.evaluate(() => window.__retailCheck.setProfile({
				posa_allow_user_to_edit_rate: 1, posa_allow_user_to_edit_item_discount: 1,
				posa_display_discount_percentage: 1, posa_display_discount_amount: 1,
			}));
			await row.locator('[aria-label="Edit rate"]').click();
			await row.locator('[data-column-key="rate"] input').fill('14');
			await row.locator('[data-column-key="rate"] input').press('Enter');
			assert.match(await page.locator('.retail-totals__due-amount').innerText(), /37.00/);
			for (const [field, value] of [['discount_percentage', '10'], ['discount_amount', '2']]) {
				await row.locator(`[data-column-key="${field}"] [role="button"]`).click();
				await row.locator(`[data-column-key="${field}"] input`).fill(value);
				await row.locator(`[data-column-key="${field}"] input`).blur();
				assert.match(await row.locator(`[data-column-key="${field}"]`).innerText(), new RegExp(value));
			}
			await row.locator('[aria-label="Next unit of measure"]').click();
			assert.match(await row.locator('[data-column-key="uom"]').innerText(), /Box/);
			if (await row.evaluate(el => el.classList.contains('posa-cart-item-row--keyboard-active'))) {
				assert.equal(await row.locator('[data-column-key="rate"]').evaluate(el => getComputedStyle(el, '::before').color), 'rgb(255, 255, 255)');
			}
			await page.screenshot({path: path.join(output, `${width}-inline-options.png`), fullPage: true});
			await page.evaluate(() => window.__retailCheck.setProfile({
				posa_allow_user_to_edit_rate: '0', posa_allow_user_to_edit_item_discount: '0',
				posa_display_discount_percentage: '0', posa_display_discount_amount: '0',
			}));
			assert.equal(await row.locator('[data-column-key="discount_percentage"]').count(), 0);
			assert.equal(await row.locator('[data-column-key="discount_amount"]').count(), 0);
			assert.equal(await row.locator('[aria-label="Edit rate"]').getAttribute('aria-disabled'), 'true');
			console.log('PASS inline rate, discount, UOM and POS Profile on/off');
		}
		await page.locator('[data-testid="invoice-action-pay"]').click();
		assert.equal(await page.locator('[data-paid]').innerText(), "1");
		assert.deepEqual(errors, [], 'component errors after editing');
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
