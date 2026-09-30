"use client";

import { MessageCircle, MessageSquareText, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { smsHref, telHref, whatsappHref } from "@/domain/customer";
import { cn } from "@/lib/utils";

/**
 * Call · SMS · WhatsApp with a prefilled message. Plain links, so they open the
 * native apps from the iPhone app and the browser alike. `onContact(channel)`
 * lets reminders log the contact.
 */
export function ContactActions({ phone, message, onContact, size = "sm", labels = true, className }) {
	if (!phone) return null;
	const channels = [
		{ key: "call", label: "Sună", icon: Phone, href: telHref(phone) },
		{ key: "sms", label: "SMS", icon: MessageSquareText, href: smsHref(phone, message) },
		{
			key: "whatsapp",
			label: "WhatsApp",
			icon: MessageCircle,
			href: whatsappHref(phone, message),
			external: true,
			className: "text-emerald-700 dark:text-emerald-400",
		},
	];
	return (
		<div className={cn("flex flex-wrap gap-2", className)}>
			{channels.map((c) => (
				<Button
					key={c.key}
					asChild
					variant="outline"
					size={labels ? size : size === "touch" ? "icon-touch" : "icon"}
					className={cn(labels && "max-md:flex-1", c.className)}
				>
					<a
						href={c.href}
						target={c.external ? "_blank" : undefined}
						rel={c.external ? "noreferrer" : undefined}
						onClick={() => onContact?.(c.key)}
						aria-label={labels ? undefined : c.label}
					>
						<c.icon aria-hidden />
						{labels && c.label}
					</a>
				</Button>
			))}
		</div>
	);
}
