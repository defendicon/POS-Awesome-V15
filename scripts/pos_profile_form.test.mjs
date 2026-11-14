import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(
	repositoryRoot,
	"posawesome",
	"posawesome",
	"api",
	"pos_profile.js",
);

async function loadPosProfileHandlers() {
	const source = await readFile(scriptPath, "utf8");
	let handlers;
	const frappe = {
		call() {},
		ui: {
			form: {
				on(doctype, events) {
					assert.equal(doctype, "POS Profile");
					handlers = events;
				},
			},
		},
	};

	vm.runInNewContext(source, { frappe }, { filename: scriptPath });
	return handlers;
}

function makeForm(fields_dict) {
	const calls = [];
	return {
		calls,
		fields_dict,
		set_query(fieldname, tableFieldname, queryFactory) {
			if (queryFactory) {
				// Match Frappe v16's child-table path, which throws if the grid is unavailable.
				this.fields_dict[tableFieldname].grid.get_field(fieldname).get_query =
					queryFactory;
				calls.push([fieldname, tableFieldname, queryFactory]);
				return;
			}

			if (this.fields_dict[fieldname]) {
				this.fields_dict[fieldname].get_query = tableFieldname;
				calls.push([fieldname, tableFieldname]);
			}
		},
	};
}

test("POS Profile setup tolerates optional fields and uninitialized grids", async () => {
	const handlers = await loadPosProfileHandlers();
	const frm = makeForm({
		posa_allowed_selling_price_lists: {},
		posa_allowed_expense_accounts: {},
		posa_allowed_source_accounts: {},
	});

	assert.doesNotThrow(() => handlers.setup(frm));
	assert.deepEqual(frm.calls, []);
});

test("allowed selling price lists respect selling status and profile currency", async () => {
	const handlers = await loadPosProfileHandlers();
	const frm = makeForm({
		posa_allowed_selling_price_lists: { grid: { get_field: () => ({}) } },
	});
	handlers.refresh(frm);
	const [[field, table, query]] = frm.calls;
	assert.equal(field, "price_list");
	assert.equal(table, "posa_allowed_selling_price_lists");
	assert.deepEqual({ ...query({ currency: "PKR" }).filters }, {
		enabled: 1,
		selling: 1,
		currency: "PKR",
	});
	assert.deepEqual({ ...query({ currency: "PKR", posa_allow_multi_currency: 1 }).filters }, {
		enabled: 1,
		selling: 1,
	});
});

test("POS Profile refresh installs queries after grids initialize", async () => {
	const handlers = await loadPosProfileHandlers();
	const childFields = {
		posa_allowed_expense_accounts: {
			grid: { get_field: () => ({}) },
		},
		posa_allowed_source_accounts: {
			grid: { get_field: () => ({}) },
		},
	};
	const frm = makeForm({
		posa_cash_mode_of_payment: {},
		posa_default_expense_account: {},
		posa_back_office_cash_account: {},
		posa_default_source_account: {},
		posa_gift_card_liability_account: {},
		...childFields,
	});

	handlers.refresh(frm);

	assert.equal(frm.calls.length, 7);
	assert.deepEqual({ ...frm.calls[0][1]().filters }, { type: "Cash" });
	assert.deepEqual({ ...frm.calls[1][1]({ company: "Acme" }).filters }, {
		company: "Acme",
		is_group: 0,
		root_type: "Expense",
	});
	assert.deepEqual({ ...frm.calls[5][2]({ company: "Acme" }).filters }, {
		company: "Acme",
		is_group: 0,
		root_type: "Expense",
	});
	assert.deepEqual({ ...frm.calls[6][2]({ company: "Acme" }).filters }, {
		company: "Acme",
		is_group: 0,
		account_type: "Cash",
	});
});
