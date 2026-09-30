"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Renders the first `pageSize` items and grows as a sentinel scrolls into view.
 * A new `items` array (filter or search changed) starts from the top again.
 */
export function useProgressive(items, pageSize = 60) {
	const [state, setState] = useState({ items, limit: pageSize });
	if (state.items !== items) setState({ items, limit: pageSize });
	const limit = state.items === items ? state.limit : pageSize;
	const sentinelRef = useRef(null);
	const hasMore = limit < items.length;

	useEffect(() => {
		const node = sentinelRef.current;
		if (!node || !hasMore) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) setState((s) => ({ ...s, limit: s.limit + pageSize }));
			},
			{ rootMargin: "900px 0px" },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, [hasMore, limit, pageSize]);

	return { visible: items.slice(0, limit), hasMore, sentinelRef };
}

/** Bordered list with hairline dividers; rows skip layout while off-screen. */
export function DataList({ items, renderRow, getKey = (item) => item.id, header, empty = null, pageSize, className }) {
	const { visible, hasMore, sentinelRef } = useProgressive(items, pageSize);
	if (!items.length) return empty;
	return (
		<div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
			{header}
			<ul role="list" className="divide-y">
				{visible.map((item, index) => (
					<li key={getKey(item)} className="cv-row">
						{renderRow(item, index)}
					</li>
				))}
			</ul>
			{hasMore && (
				<div ref={sentinelRef} className="flex h-14 items-center justify-center border-t text-xs text-muted-foreground">
					Se încarcă…
				</div>
			)}
		</div>
	);
}

/**
 * Clickable list row (link or button), 60 px on phones, 48 px from md.
 * `nested`: the row contains its own buttons, so it renders as a focusable div.
 */
export function ListRow({ href, onClick, nested = false, className, children, ...props }) {
	const cls = cn(
		"flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none md:min-h-12",
		className,
	);
	if (href) {
		return (
			<Link href={href} prefetch={false} className={cls} {...props}>
				{children}
			</Link>
		);
	}
	if (onClick && nested) {
		return (
			<div
				role="button"
				tabIndex={0}
				onClick={onClick}
				onKeyDown={(e) => {
					if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
						e.preventDefault();
						onClick(e);
					}
				}}
				className={cn(cls, "cursor-pointer")}
				{...props}
			>
				{children}
			</div>
		);
	}
	if (onClick) {
		return (
			<button type="button" onClick={onClick} className={cls} {...props}>
				{children}
			</button>
		);
	}
	return (
		<div className={cls} {...props}>
			{children}
		</div>
	);
}

/** Column headings for a DataList on desktop (hidden on phones). `cols` = the rows' grid template. */
export function ListHeader({ cols, className, children }) {
	return (
		<div
			className={cn(
				"hidden items-center gap-3 border-b bg-muted/50 px-4 py-2 text-2xs font-medium tracking-wider text-muted-foreground uppercase",
				cols ? `md:grid ${cols}` : "md:flex",
				className,
			)}
		>
			{children}
		</div>
	);
}
