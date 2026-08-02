// 本地生成管理员密码 hash 的一次性脚本
// 用法：node scripts/generate-password-hash.mjs "你的明文密码"
// 输出的 ADMIN_PASSWORD_HASH 填到 EdgeOne 项目环境变量
//
// 算法：PBKDF2-SHA256，10 万次迭代，16 字节盐；输出格式 "pbkdf2$100000$<saltB64>$<hashB64>"
// 与 edge-functions/_shared/password.ts 中的校验函数保持一致

import { webcrypto } from "node:crypto";

const ITERATIONS = 100_000;
const HASH_LEN_BITS = 256;
const SALT_LEN = 16;

function b64(bytes) {
	return Buffer.from(bytes).toString("base64");
}

async function hashPassword(password) {
	const salt = new Uint8Array(SALT_LEN);
	webcrypto.getRandomValues(salt);
	const enc = new TextEncoder();
	const keyMaterial = await webcrypto.subtle.importKey(
		"raw",
		enc.encode(password),
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);
	const bits = await webcrypto.subtle.deriveBits(
		{ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
		keyMaterial,
		HASH_LEN_BITS,
	);
	return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

async function main() {
	const pwd = process.argv[2];
	if (!pwd) {
		console.error("用法：node scripts/generate-password-hash.mjs \"<明文密码>\"");
		process.exit(1);
	}
	const hash = await hashPassword(pwd);
	console.log("\nADMIN_PASSWORD_HASH=");
	console.log(hash);
	console.log("\n将上面这行值填入 EdgeOne 项目环境变量 ADMIN_PASSWORD_HASH。");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
