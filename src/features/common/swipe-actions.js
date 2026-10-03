import { MessageCircle, MessageSquare, Phone } from "lucide-react";
import { normalizePhone, smsHref, telHref, whatsappHref } from "@/domain/customer";
import { openExternal } from "@/lib/links";

/** Swipe actions (SwipeRow) for reaching a person: call, SMS. Empty without a usable number. */
export function contactSwipeActions(phone) {
	if (!normalizePhone(phone)) return [];
	return [
		{ key: "call", label: "Sună", icon: Phone, tone: "green", onSelect: () => openExternal(telHref(phone)) },
		{ key: "sms", label: "SMS", icon: MessageSquare, tone: "blue", onSelect: () => openExternal(smsHref(phone)) },
	];
}

export function whatsappSwipeAction(phone) {
	if (!normalizePhone(phone)) return [];
	return [{ key: "whatsapp", label: "WhatsApp", icon: MessageCircle, tone: "green", onSelect: () => openExternal(whatsappHref(phone)) }];
}
