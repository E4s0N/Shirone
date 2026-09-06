#!/usr/bin/env node
// EdgeOne Pages 构建包装器：在平台构建环境内按顺序执行编译步骤，
// 根据真实构建结果通过企业微信应用消息推送成功摘要或失败错误摘录，
// 并按原编译命令的退出码退出（失败时 EdgeOne 会正确标记部署失败）。
//
// EdgeOne 控制台配置：
//   编译命令: node scripts/deploy/edgeone-build.mjs
//   环境变量: CONTENT_REPO_URL（content:sync 拉取内容仓用，已有）；
//             WECOM_CORP_ID / WECOM_AGENT_ID / WECOM_SECRET（必填，企业微信凭据）；
//             WECOM_TOUSER / SITE_URL（可选：指定接收人、消息中的站点链接）；
//             DEPLOY_BUILD_STEPS（可选，覆盖默认编译步骤，JSON 数组：
//             [["步骤名", "命令", "参数", ...], ...]）
//
// 未配置 WECOM_* 环境变量时跳过通知，构建流程不受影响。
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const WECOM_CLI = fileURLToPath(
	new URL("../notify/wecom.mjs", import.meta.url),
);
// 通知里只保留输出末尾的摘录，避免超长日志撑爆企业微信消息上限
const OUTPUT_TAIL_CHARS = 1200;
const DEFAULT_STEPS = JSON.stringify([
	["content:sync", "pnpm", "content:sync"],
	["build", "pnpm", "build"],
]);

function resolveSteps() {
	try {
		const parsed = JSON.parse(process.env.DEPLOY_BUILD_STEPS ?? DEFAULT_STEPS);
		if (
			Array.isArray(parsed) &&
			parsed.every(
				(step) =>
					Array.isArray(step) &&
					typeof step[0] === "string" &&
					typeof step[1] === "string",
			)
		) {
			return parsed;
		}
	} catch {
		// 覆盖配置不合法时回退到默认编译步骤
	}
	console.error(
		"[deploy-notify] DEPLOY_BUILD_STEPS 配置不合法，使用默认编译步骤",
	);
	return JSON.parse(DEFAULT_STEPS);
}

// 转发子进程输出的同时保留末尾摘录，构建失败时随通知发送
function createOutputTail() {
	let tail = "";
	return {
		write(chunk) {
			tail = `${tail}${chunk}`;
			if (tail.length > OUTPUT_TAIL_CHARS * 2)
				tail = tail.slice(-OUTPUT_TAIL_CHARS * 2);
		},
		excerpt() {
			return tail.length > OUTPUT_TAIL_CHARS
				? `……（前面已省略）\n${tail.slice(-OUTPUT_TAIL_CHARS)}`
				: tail;
		},
	};
}

async function runStep(label, command, args) {
	const startedAt = Date.now();
	const tail = createOutputTail();
	console.log(
		`\n[deploy-notify] === 步骤 ${label}: ${command} ${args.join(" ")} ===`,
	);
	const child = spawn(command, args, {
		cwd: ROOT,
		stdio: ["ignore", "pipe", "pipe"],
	});
	const code = await new Promise((resolve) => {
		let settled = false;
		const settle = (exitCode) => {
			if (settled) return;
			settled = true;
			resolve(exitCode);
		};
		child.stdout.on("data", (chunk) => {
			process.stdout.write(chunk);
			tail.write(String(chunk));
		});
		child.stderr.on("data", (chunk) => {
			process.stderr.write(chunk);
			tail.write(String(chunk));
		});
		// ENOENT 等启动失败只会触发 error 而不触发 close，两个事件都要兜住
		child.on("close", (exitCode) => settle(exitCode ?? -1));
		child.on("error", (error) => {
			const message = `[deploy-notify] 无法启动命令 ${command}: ${error.message}`;
			console.error(message);
			tail.write(`\n${message}`);
			settle(-1);
		});
	});
	return {
		label,
		code,
		seconds: Math.round((Date.now() - startedAt) / 1000),
		tail: tail.excerpt(),
	};
}

function gitInfo() {
	const run = (args) => {
		try {
			return execFileSync("git", args, {
				cwd: ROOT,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			}).trim();
		} catch {
			return "";
		}
	};
	return {
		sha: run(["rev-parse", "--short", "HEAD"]),
		subject: run(["log", "-1", "--format=%s"]),
	};
}

function commitLine() {
	const { sha, subject } = gitInfo();
	if (!sha) return "";
	return `\n> 提交：${sha}${subject ? ` ${subject}` : ""}`;
}

function siteLine() {
	return process.env.SITE_URL ? `\n> [访问站点](${process.env.SITE_URL})` : "";
}

function successMessage(results) {
	const breakdown = results
		.map((result) => `${result.label} ${result.seconds}s`)
		.join(" + ");
	const total = results.reduce((sum, result) => sum + result.seconds, 0);
	return [
		"## ✅ EdgeOne 构建成功",
		`> 总耗时：${total} 秒（${breakdown}）`,
		`> Node：${process.version}`,
		commitLine(),
		siteLine(),
		"> 构建已完成，发布与 CDN 更新由 EdgeOne 平台继续处理",
	]
		.filter(Boolean)
		.join("\n");
}

function failureMessage(failed) {
	return [
		"## ❌ EdgeOne 构建失败",
		`> 失败步骤：${failed.label}（退出码 ${failed.code}）`,
		commitLine(),
		"> 构建日志见 EdgeOne 控制台",
		siteLine(),
		"错误输出末尾：",
		"```",
		failed.tail,
		"```",
	]
		.filter(Boolean)
		.join("\n");
}

async function notify(content) {
	if (
		!process.env.WECOM_CORP_ID ||
		!process.env.WECOM_AGENT_ID ||
		!process.env.WECOM_SECRET
	) {
		console.log("[deploy-notify] 未配置 WECOM_* 环境变量，跳过企业微信通知");
		return;
	}
	const file = join(tmpdir(), `edgeone-build-notify-${Date.now()}.md`);
	writeFileSync(file, content, "utf8");
	try {
		const result = spawnSync(process.execPath, [WECOM_CLI, file], {
			encoding: "utf8",
		});
		if (result.status !== 0)
			console.error(
				`[deploy-notify] 企业微信通知发送失败：${result.stderr?.trim()}`,
			);
		else console.log("[deploy-notify] 企业微信通知已发送");
	} finally {
		rmSync(file, { force: true });
	}
}

const steps = resolveSteps();
const results = [];
let failed = null;
for (const [label, command, ...args] of steps) {
	const result = await runStep(label, command, args);
	results.push(result);
	if (result.code !== 0) {
		failed = result;
		break;
	}
}

try {
	await notify(failed ? failureMessage(failed) : successMessage(results));
} catch (error) {
	console.error(
		`[deploy-notify] 企业微信通知发送失败：${error instanceof Error ? error.message : String(error)}`,
	);
}

if (failed) {
	console.error(
		`[deploy-notify] 步骤 ${failed.label} 失败（退出码 ${failed.code}）`,
	);
	process.exit(1);
}
