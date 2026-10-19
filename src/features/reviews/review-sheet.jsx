"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleCheck, Copy, MessageCircle, MessageSquareText, Star } from "lucide-react";
import { toast } from "@/lib/toast";
import { DetailSheet } from "@/components/ds/detail-sheet";
import { FlowSteps } from "@/components/ds/flow-steps";
import { Field } from "@/components/ds/inputs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { smsHref, whatsappHref } from "@/domain/customer";
import { REVIEW_TAGS as TAG_KEYS, reviewMessage, reviewState } from "@/domain/review";
import { formatPlate, vehicleName } from "@/domain/vehicle";
import { fmtDate } from "@/lib/format";
import { copyText } from "@/lib/hooks";
import { REVIEW_STATE, REVIEW_TAGS } from "@/lib/labels";
import { dropLastReviewRequest, logReviewRequest, markReviewReceived, noteOnCustomer } from "@/lib/store/actions";
import { useCollection, useEntity, useSettings } from "@/lib/store/hooks";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { ReviewLinks } from "@/features/flow/visit-links";

const STEPS = ["none", "requested", "received"].map((key) => ({ key, label: REVIEW_STATE[key].label, tone: REVIEW_STATE[key].tone }));
const CHANNEL = { whatsapp: "WhatsApp", sms: "SMS", copy: "copiat" };

/**
 * The review of a visit (docs/VISIT-FLOW.md §6.4): the last record of the flow. It asks the
 * customer for their opinion (the message, with the shop's review link, sent on WhatsApp or SMS
 * or copied; every send is logged) and keeps the admin's own note on the customer (stars, tags,
 * a text) that is shown later on the customer, their bookings and check-in. One per job.
 */
export default function ReviewSheet({ open, onOpenChange, workOrderId }) {
	const settings = useSettings();
	const order = useEntity("workOrders", workOrderId);
	const customer = useEntity("customers", order?.customerId);
	const vehicle = useEntity("vehicles", order?.vehicleId);
	const reviews = useCollection("reviews");
	const review = Object.values(reviews ?? {}).find((r) => r.workOrderId === workOrderId) ?? null;
	const state = reviewState(review);
	const [message, setMessage] = useState(null); // null: the default message, which follows the data until edited
	const text = message ?? (order ? reviewMessage({ customer, vehicle, settings }) : "");
	const phone = customer?.phone;

	const run = (action) => {
		try {
			return action();
		} catch (error) {
			toast.error(error.message);
			return null;
		}
	};

	// The app only opens WhatsApp or SMS: it cannot know the message left, so a send is logged with a way to take it back.
	const sent = (channel) => {
		if (!run(() => logReviewRequest(workOrderId, channel))) return;
		toast.success(channel === "copy" ? "Mesajul a fost copiat." : `Cerere deschisă în ${CHANNEL[channel]}.`, {
			action: { label: "N-am trimis", onClick: () => run(() => dropLastReviewRequest(workOrderId)) },
		});
	};
	const copy = async () => {
		if (await copyText(text)) sent("copy");
		else toast.error("Nu am putut copia mesajul: selectează-l și copiază-l de mână.");
	};

	const received = (yes) => run(() => markReviewReceived(workOrderId, yes)) && toast.success(yes ? "Recenzie primită." : "Marcată ca nerăspunsă.");

	const next =
		state === "requested"
			? { label: "Clientul a răspuns", icon: CircleCheck, hint: "Marchează când a lăsat recenzia sau ți-a spus părerea.", onClick: () => received(true) }
			: state === "none"
				? { label: phone ? "Trimite pe WhatsApp" : "Copiază mesajul", icon: phone ? MessageCircle : Copy, hint: "Mesajul de mai jos, cu linkul pentru recenzii.", onClick: phone
						? () => {
								window.open(whatsappHref(phone, text), "_blank", "noopener");
								sent("whatsapp");
							}
						: copy,
				}
				: null;
	const notice =
		state === "received" ? (
			<div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:flex-row sm:items-center">
				<p className="flex min-w-0 flex-1 items-center gap-1.5">
					<CircleCheck className={cn("size-4 shrink-0", tone("green").text)} aria-hidden />
					<span>
						Primită pe <span className="font-medium tabular-nums">{fmtDate(review.receivedAt, "d MMM, HH:mm")}</span>.
					</span>
				</p>
				<Button size="sm" variant="ghost" className="max-md:h-11" onClick={() => received(false)}>
					Nu a răspuns, de fapt
				</Button>
			</div>
		) : null;

	return (
		<DetailSheet
			open={open}
			onOpenChange={onOpenChange}
			entity={order}
			missing="Lucrarea a fost ștearsă."
			title="Recenzie"
			description={order ? [customer?.name, [vehicleName(vehicle), vehicle?.plate && formatPlate(vehicle.plate)].filter(Boolean).join(" ")].filter(Boolean).join(" · ") : undefined}
		>
			{order && (
				<div className="space-y-6">
					<ReviewLinks order={order} />
					<FlowSteps label="Starea recenziei" steps={STEPS} current={STEPS.findIndex((step) => step.key === state)} next={next} notice={notice} />

					<section aria-label="Cere părerea clientului" className="space-y-3">
						<h3 className="text-sm font-semibold">Cere părerea clientului</h3>
						<Textarea value={text} onChange={(event) => setMessage(event.target.value)} rows={5} aria-label="Mesajul către client" />
						{!settings.reviews?.link && (
							<p className="text-xs text-muted-foreground">
								Mesajul nu are încă un link.{" "}
								<Link href="/settings/#recenzii" className="font-medium text-foreground underline-offset-2 hover:underline">
									Adaugă-l în Setări → Recenzii
								</Link>
							</p>
						)}
						<div className="flex flex-wrap gap-2">
							{phone ? (
								<>
									<Button asChild variant="outline" className="max-md:h-11">
										<a href={whatsappHref(phone, text)} target="_blank" rel="noreferrer" onClick={() => sent("whatsapp")}>
											<MessageCircle /> WhatsApp
										</a>
									</Button>
									<Button asChild variant="outline" className="max-md:h-11">
										<a href={smsHref(phone, text)} onClick={() => sent("sms")}>
											<MessageSquareText /> SMS
										</a>
									</Button>
								</>
							) : (
								<p className="self-center text-xs text-muted-foreground">Clientul nu are telefon: copiază mesajul și trimite-l altfel.</p>
							)}
							<Button variant="outline" className="max-md:h-11" onClick={copy}>
								<Copy /> Copiază
							</Button>
						</div>
						{review?.requests?.length > 0 && (
							<ul className="space-y-1 text-xs text-muted-foreground" aria-label="Cereri trimise">
								{[...review.requests].reverse().map((request) => (
									<li key={request.at} className="tabular-nums">
										{fmtDate(request.at, "d MMM, HH:mm")} · {CHANNEL[request.channel]}
									</li>
								))}
							</ul>
						)}
					</section>

					<CustomerNoteEditor key={review?.id ?? "new"} review={review} workOrderId={workOrderId} />
				</div>
			)}
		</DetailSheet>
	);
}

/** The admin's own note on the customer: internal, saved as it is given. */
function CustomerNoteEditor({ review, workOrderId }) {
	const [note, setNote] = useState(review?.note ?? "");
	const save = (fields) => {
		try {
			noteOnCustomer(workOrderId, fields);
		} catch (error) {
			toast.error(error.message);
		}
	};
	const rating = review?.rating ?? null;
	const tags = review?.tags ?? [];
	return (
		<section aria-label="Nota ta despre client" className="space-y-3">
			<div>
				<h3 className="text-sm font-semibold">Nota ta</h3>
				<p className="text-xs text-muted-foreground">Internă: clientul nu o vede. O găsești data viitoare la client, la programări și la primire.</p>
			</div>
			<div role="radiogroup" aria-label="Stele" className="flex gap-1">
				{[1, 2, 3, 4, 5].map((value) => (
					<button
						key={value}
						type="button"
						role="radio"
						aria-checked={rating === value}
						aria-label={`${value} ${value === 1 ? "stea" : "stele"}`}
						// The same star again takes the stars away.
						onClick={() => save({ rating: rating === value ? null : value })}
						className="flex size-11 items-center justify-center rounded-md transition-colors hover:bg-accent md:size-9"
					>
						<Star className={cn("size-6 md:size-5", rating && value <= rating ? cn("fill-current", tone("yellow").text) : "text-muted-foreground")} aria-hidden />
					</button>
				))}
			</div>
			<div role="group" aria-label="Etichete" className="flex flex-wrap gap-1.5">
				{TAG_KEYS.map((tag) => {
					const on = tags.includes(tag);
					return (
						<button
							key={tag}
							type="button"
							aria-pressed={on}
							onClick={() => save({ tags: on ? tags.filter((t) => t !== tag) : [...tags, tag] })}
							className={cn("inline-flex h-11 items-center rounded-full border px-3 text-sm transition-colors hover:bg-accent md:h-8", on && "border-foreground bg-accent font-medium")}
						>
							{REVIEW_TAGS[tag]}
						</button>
					);
				})}
			</div>
			<Field label="Notiță">{(id) => <Textarea id={id} value={note} onChange={(event) => setNote(event.target.value)} onBlur={() => note !== (review?.note ?? "") && save({ note })} placeholder="ex. plătește la timp, vrea mereu piese originale" />}</Field>
		</section>
	);
}
