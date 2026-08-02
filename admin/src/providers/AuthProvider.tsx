import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { apiClient } from "../api/client";

// 会话信息:后端把 JWT 放 httpOnly Cookie,前端只需要知道"是否登录"与用户名展示
export interface SessionInfo {
	username: string;
}

interface AuthContextValue {
	session: SessionInfo | null;
	loading: boolean;
	// 触发登录:成功后写入 session,失败抛出错误由调用方展示
	login: (username: string, password: string) => Promise<void>;
	logout: () => Promise<void>;
	// 手动刷新会话状态,例如 401 后
	refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface Props {
	children: ReactNode;
}

export function AuthProvider({ children }: Props) {
	const [session, setSession] = useState<SessionInfo | null>(null);
	// 首次挂载先校验一次 Cookie,决定是否要重定向到登录页
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		try {
			const me = await apiClient.get<SessionInfo>("/api/auth/me");
			setSession(me);
		} catch {
			setSession(null);
		}
	}, []);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			await refresh();
			if (!cancelled) setLoading(false);
		})();
		return () => {
			cancelled = true;
		};
	}, [refresh]);

	const login = useCallback(async (username: string, password: string) => {
		const info = await apiClient.post<SessionInfo>("/api/auth/login", {
			username,
			password,
		});
		setSession(info);
	}, []);

	const logout = useCallback(async () => {
		try {
			await apiClient.post("/api/auth/logout", {});
		} finally {
			setSession(null);
		}
	}, []);

	const value = useMemo<AuthContextValue>(
		() => ({ session, loading, login, logout, refresh }),
		[session, loading, login, logout, refresh],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用");
	return ctx;
}
