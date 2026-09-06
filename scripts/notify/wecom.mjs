#!/usr/bin/env node
// 企业微信应用消息通知脚本（供 GitHub Actions 与本地调用，零依赖）：
//   node scripts/notify/wecom.mjs [消息文件]
// 消息内容依次取自：命令行传入的文件 > stdin > WECOM_MESSAGE 环境变量。
// 配置（环境变量，对应 GitHub Actions secrets）：
//   WECOM_CORP_ID / WECOM_AGENT_ID / WECOM_SECRET  必填
//   WECOM_TOUSER   可选，接收人，默认 @all（如 "user1|user2"）
//   WECOM_API_BASE 可选，仅本地测试用，默认官方 API 地址
// 消息为企业微信 markdown 子集（#、>、**、[]()、<font>）；超过 4096 字节上限时自动截断。
import { readFileSync } from "node:fs";

const DEFAULT_API_BASE = "https://qyapi.weixin.qq.com";
// 企业微信 markdown 消息 content 上限为 4096 字节，预留余量避免整条消息被拒
const SAFE_CONTENT_BYTES = 3800;
const TRUNCATION_SUFFIX = "\n……（内容过长已截断）";

function byteLength(text) {
	return Buffer.byteLength(text, "utf8");
}

function truncateToWeComLimit(content) {
	if (byteLength(content) <= SAFE_CONTENT_BYTES) return content;
	const suffixBytes = byteLength(TRUNCATION_SUFFIX);
	let cut = SAFE_CONTENT_BYTES - suffixBytes;
	// 半字符截断会在 toString 时产生替换字符并膨胀字节数，回退到预算内为止
	let body = Buffer.from(content, "utf8")
		.subarray(0, cut)
		.toString("utf8")
		.trimEnd();
	while (byteLength(body) + suffixBytes > SAFE_CONTENT_BYTES && cut > 0) {
		cut -= 4;
		body = Buffer.from(content, "utf8")
			.subarray(0, cut)
			.toString("utf8")
			.trimEnd();
	}
	return body + TRUNCATION_SUFFIX;
}

async function readStdin() {
	if (process.stdin.isTTY) return "";
	process.stdin.setEncoding("utf8");
	let content = "";
	for await (const chunk of process.stdin) content += chunk;
	return content;
}

async function resolveContent() {
	const fileArg = process.argv[2];
	if (fileArg) return readFileSync(fileArg, "utf8");
	if (process.env.WECOM_MESSAGE) return process.env.WECOM_MESSAGE;
	return readStdin();
}

async function getAccessToken(apiBase) {
	const query = new URLSearchParams({
		corpid: process.env.WECOM_CORP_ID ?? "",
		corpsecret: process.env.WECOM_SECRET ?? "",
	});
	const response = await fetch(`${apiBase}/cgi-bin/gettoken?${query}`, {
		signal: AbortSignal.timeout(30_000),
	});
	const data = await response.json();
	if (data.errcode !== 0 || !data.access_token) {
		throw new Error(
			`获取 access_token 失败: errcode=${data.errcode} errmsg=${data.errmsg}`,
		);
	}
	return data.access_token;
}

async function sendMarkdown(apiBase, agentId, content) {
	const token = await getAccessToken(apiBase);
	const response = await fetch(
		`${apiBase}/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				touser: process.env.WECOM_TOUSER || "@all",
				msgtype: "markdown",
				agentid: agentId,
				markdown: { content },
				enable_duplicate_check: 1,
				duplicate_check_interval: 1800,
			}),
			signal: AbortSignal.timeout(30_000),
		},
	);
	const data = await response.json();
	if (data.errcode !== 0) {
		throw new Error(
			`发送消息失败: errcode=${data.errcode} errmsg=${data.errmsg}`,
		);
	}
}

async function main() {
	const content = (await resolveContent()).trim();
	if (!content) {
		console.error(
			"[wecom-notify] 消息内容为空（未提供文件、stdin 或 WECOM_MESSAGE），跳过发送",
		);
		process.exitCode = 1;
		return;
	}
	const missing = ["WECOM_CORP_ID", "WECOM_AGENT_ID", "WECOM_SECRET"].filter(
		(name) => !process.env[name],
	);
	if (missing.length) {
		console.error(`[wecom-notify] 缺少配置：${missing.join(", ")}，跳过发送`);
		process.exitCode = 1;
		return;
	}
	const agentId = Number(process.env.WECOM_AGENT_ID);
	if (!Number.isInteger(agentId)) {
		console.error("[wecom-notify] WECOM_AGENT_ID 必须是整数");
		process.exitCode = 1;
		return;
	}
	const apiBase = (process.env.WECOM_API_BASE || DEFAULT_API_BASE).replace(
		/\/+$/,
		"",
	);
	try {
		await sendMarkdown(apiBase, agentId, truncateToWeComLimit(content));
		console.log(`[wecom-notify] 消息已发送（${byteLength(content)} 字节）`);
	} catch (error) {
		console.error(
			`[wecom-notify] ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exitCode = 1;
	}
}

await main();
