"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

const loadDialog = () => import("./confirm-dialog");
const ConfirmDialog = dynamic(loadDialog, { ssr: false });

const ConfirmContext = createContext(async () => false);

/**
 * One confirmation dialog for the whole app, loaded on first use:
 *   const confirm = useConfirm();
 *   if (await confirm({ title, description, confirmLabel, destructive: true })) …
 */
export function ConfirmProvider({ children }) {
	const [request, setRequest] = useState(null);
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 2000));
		const handle = idle(() => loadDialog());
		return () => window.cancelIdleCallback?.(handle);
	}, []);

	const confirm = useCallback(
		(options) =>
			new Promise((resolve) => {
				setRequest({ ...options, resolve });
				setOpen(true);
			}),
		[],
	);

	const settle = (result) => {
		request?.resolve(result);
		setOpen(false);
	};

	return (
		<ConfirmContext.Provider value={confirm}>
			{children}
			{request && <ConfirmDialog request={request} open={open} onSettle={settle} />}
		</ConfirmContext.Provider>
	);
}

export const useConfirm = () => useContext(ConfirmContext);
