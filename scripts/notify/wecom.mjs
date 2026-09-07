#!/usr/bin/env node
// 企业微信消息通知脚本（供 GitHub Actions 与本地调用，零依赖）：
//   node scripts/notify/wecom.mjs [消息文件]
// 消息内容依次取自：命令行传入的文件 > stdin > WECOM_MESSAGE 环境变量。
//
// 两种发送通道（设置了 WECOM_WEBHOOK_URL 时优先走群机器人）：
//   1. 群机器人 webhook：只配 WECOM_WEBHOOK_URL（群聊添加机器人后的 webhook 地址）。
//      无 IP 白名单限制，适合 GitHub Actions 等 IP 不固定的 CI 环境。
//   2. 自建应用 API：配 WECOM_CORP_ID / WECOM_AGENT_ID / WECOM_SECRET，
//      可选 WECOM_TOUSER（默认 @all）。受企业微信「可信 IP」白名单限制，
//      仅适合来源 IP 固定且已加入白名单的环境（WECOM_API_BASE 可指向自建
//      反向代理以获得固定出口 IP）。
//
// 消息为纯文本（企业微信 text 消息上限 2048 字节）；超过预算时自动截断。
import { readFileSync } from "node:fs";

const DEFAULT_API_BASE = "https://qyapi.weixin.qq.com";
// 企业微信 text 消息 content 上限为 2048 字节，预留余量避免整条消息被拒
const SAFE_CONTENT_BYTES = 1900;
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

// 群机器人 webhook：key 直接在 URL 里，无 IP 限制，无 token 流程
async function sendViaWebhook(webhookUrl, content) {
	const response = await fetch(webhookUrl, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			msgtype: "text",
			text: { content },
		}),
		signal: AbortSignal.timeout(30_000),
	});
	const data = await response.json();
	if (data.errcode !== 0) {
		throw new Error(
			`发送消息失败: errcode=${data.errcode} errmsg=${data.errmsg}`,
		);
	}
}

async function sendText(apiBase, agentId, content) {
	const token = await getAccessToken(apiBase);
	const response = await fetch(
		`${apiBase}/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				touser: process.env.WECOM_TOUSER || "@all",
				msgtype: "text",
				agentid: agentId,
				text: { content },
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
	const payload = truncateToWeComLimit(content);
	const channel = process.env.WECOM_WEBHOOK_URL ? "webhook" : "app";
	try {
		if (channel === "webhook") {
			await sendViaWebhook(process.env.WECOM_WEBHOOK_URL, payload);
		} else {
			const missing = [
				"WECOM_CORP_ID",
				"WECOM_AGENT_ID",
				"WECOM_SECRET",
			].filter((name) => !process.env[name]);
			if (missing.length) {
				console.error(
					`[wecom-notify] 缺少配置：${missing.join(", ")}（或配置 WECOM_WEBHOOK_URL），跳过发送`,
				);
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
			await sendText(apiBase, agentId, payload);
		}
		console.log(
			`[wecom-notify] 消息已发送（通道 ${channel}，${byteLength(content)} 字节）`,
		);
	} catch (error) {
		console.error(
			`[wecom-notify] ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exitCode = 1;
	}
}

await main();
