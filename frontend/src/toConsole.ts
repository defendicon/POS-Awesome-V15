declare const $: any;
declare const frappe: any;

$(function () {
	frappe.realtime.on("toconsole", function (data: unknown[]) {
		data.forEach((element) => {
			console.log(element);
		});
	});
});
