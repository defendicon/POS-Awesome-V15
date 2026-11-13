(() => {
	const snapshot = document.getElementById("posa-offline-desk-docs");
	if (!snapshot) return;

	const docs = JSON.parse(snapshot.textContent);
	const page = docs.find((doc) => doc.doctype === "Page" && doc.name === "posapp");
	// Desk checks .script to detect a loaded Page and executes .__script first.
	if (page && !page.script) page.script = page.__script;
	frappe.model.sync(docs);
	snapshot.remove();
})();
