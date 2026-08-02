// EdgeOne Makers 项目根 middleware：在所有请求前做轻量拦截
//
// 重要：EdgeOne middleware 的 context 文档只列了 request/next/redirect/rewrite/geo/clientIp，
// 不保证能访问 env。因此本中间件不读环境变量、不做 JWT 验签（验签需 JWT_SECRET）。
// 它只做两件不依赖 env 的事：
//   1. 非 /api/* 路径（SPA 静态资源）直接放行
//   2. /api/* 中，白名单（登录、公开只读）放行；其余要求请求带会话 Cookie，否则 401
// 真正的 JWT 签名验证由各受保护 Edge Function 内部完成（它们能访问 env.JWT_SECRET）。
// 这样即便 middleware 读不到 env，鉴权链路仍然完整。

export const config = {
	matcher: ["/api/:path*"],
};

// 白名单：无需登录即可访问的路径前缀
const PUBLIC_PATHS = ["/api/auth/login", "/api/auth/logout", "/api/public/"];

function isPublic(pathname) {
	return PUBLIC_PATHS.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p));
}

function readCookie(cookieHeader, name) {
	if (!cookieHeader) return null;
	for (const seg of cookieHeader.split(";")) {
		const [k, ...v] = seg.trim().split("=");
		if (k === name) return decodeURIComponent(v.join("="));
	}
	return null;
}

function unauthorized() {
	return new Response(JSON.stringify({ error: "unauthorized" }), {
		status: 401,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

// EdgeOne middleware 导出名必须是 `middleware`（不是 onRequest）
export async function middleware(context) {
	const { request, next } = context;
	const url = new URL(request.url);
	const { pathname, searchParams } = url;

	// 白名单放行
	if (isPublic(pathname)) {
		return next();
	}

	// 诊断模式：?diag=1 直接放行，让下游函数跑 Web Crypto 自检（定位 545）
	// 仅在联调期间使用，定位完根因后可移除
	if (searchParams.get("diag") === "1") {
		return next();
	}

	// 其余 /api/* 要求带会话 Cookie；签名是否有效由下游函数验签
	const token = readCookie(request.headers.get("cookie"), "firefly_admin_token");
	if (!token) {
		return unauthorized();
	}

	return next();
}
