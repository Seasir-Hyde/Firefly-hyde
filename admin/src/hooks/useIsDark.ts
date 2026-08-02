// 是否暗色:跟随 Semi 的 body[theme-mode]
// (原 PostEditorPage / PagesPage 各自复制的同名实现收编于此)
import { useEffect, useState } from "react";

export function useIsDark(): boolean {
	const [dark, setDark] = useState(
		() => document.body.getAttribute("theme-mode") === "dark",
	);
	useEffect(() => {
		const observer = new MutationObserver(() => {
			setDark(document.body.getAttribute("theme-mode") === "dark");
		});
		observer.observe(document.body, {
			attributes: true,
			attributeFilter: ["theme-mode"],
		});
		return () => observer.disconnect();
	}, []);
	return dark;
}
