// Opens tel:, sms: and https: links from code (swipe actions, menus). A real
// anchor click is used because it is what the iOS web view hands to the system.
export function openExternal(href) {
	const link = document.createElement("a");
	link.href = href;
	if (href.startsWith("http")) {
		link.target = "_blank";
		link.rel = "noreferrer";
	}
	document.body.appendChild(link);
	link.click();
	link.remove();
}
