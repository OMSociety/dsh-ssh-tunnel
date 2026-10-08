#!/usr/bin/env node
'use strict';
/*
 * 安装后的两类检查（install.sh / install.ps1 共用）。
 *
 *   1) node bundle-check.cjs <profile/package.json> <pkg>
 *      校验 dsh.profile.bundles 是否包含 pkg：包含退出 0（打印 ok），否则退出 1。
 *
 *   2) node bundle-check.cjs --ignored-builds <profileDir>
 *      读取 <profileDir>/node_modules/.modules.yaml 的 ignoredBuilds 段，
 *      打印 allowBuilds 可复制豁免指引。advisory 性质：恒退出 0；
 *      .modules.yaml 不存在时跳过不报错。
 */
const fs = require('fs');
const path = require('path');

function err2(msg) {
  process.stderr.write('[bundle-check] ' + msg + '\n');
}

const argv = process.argv.slice(2);

if (argv[0] === '--ignored-builds') {
  const profileDir = argv[1];
  if (!profileDir || argv.length !== 2) {
    process.stderr.write('用法: node bundle-check.cjs --ignored-builds <profileDir>\n');
    process.exit(2);
  }
  const modulesYaml = path.join(profileDir, 'node_modules', '.modules.yaml');
  let text;
  try {
    text = fs.readFileSync(modulesYaml, 'utf8');
  } catch (e) {
    console.log('[allowBuilds] 未找到 ' + modulesYaml + '，跳过 allowBuilds 预检。');
    process.exit(0);
  }
  const lines = text.split('\n');
  let start = -1;
  let inlineRest = '';
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^ignoredBuilds:(.*)$/);
    if (m) {
      start = i;
      inlineRest = m[1].trim();
      break;
    }
  }
  const entries = [];
  if (start !== -1) {
    if (inlineRest && inlineRest !== '[]') {
      // 内联形式（如 ignoredBuilds: [a, b]）
      const inner = inlineRest.replace(/^\[/, '').replace(/\]$/, '');
      for (const part of inner.split(',')) {
        const v = part.trim().replace(/^['"]|['"]$/g, '');
        if (v) entries.push(v);
      }
    } else if (!inlineRest) {
      for (let j = start + 1; j < lines.length; j++) {
        if (lines[j].trim() === '') continue;
        const im = lines[j].match(/^[ \t]+-[ \t]*(.+)$/);
        if (!im) break;
        const v = im[1].trim().replace(/^['"]|['"]$/g, '');
        if (v) entries.push(v);
      }
    }
  }
  if (entries.length === 0) {
    console.log('[allowBuilds] ignoredBuilds 为空或不存在，无需处理。');
    process.exit(0);
  }
  const wsPath = path.join(profileDir, 'pnpm-workspace.yaml');
  const out = [];
  out.push('[allowBuilds] pnpm 跳过了以下依赖的构建脚本（node_modules/.modules.yaml: ignoredBuilds）:');
  for (const e of entries) out.push('  - ' + e);
  out.push('这些包的 install 脚本没有执行，相关功能可能不完整。如需豁免，把下面内容并入 ' + wsPath + '（已有 allowBuilds 段则合并键值）:');
  out.push('');
  out.push('allowBuilds:');
  for (const e of entries) out.push('  "' + e + '": true');
  out.push('');
  out.push('注意: 键必须是上面 ignoredBuilds 行的原文（与 lockfile 中的 spec 逐字一致）；纯包名（如 ssh2）不生效。');
  console.log(out.join('\n'));
  process.exit(0);
}

// 模式 1：bundle 校验
const pkgJsonPath = argv[0];
const pkg = argv[1];
if (!pkgJsonPath || !pkg || argv.length !== 2) {
  process.stderr.write('用法: node bundle-check.cjs <profile/package.json> <pkg>\n');
  process.exit(2);
}
let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
} catch (e) {
  err2('读取/解析失败: ' + pkgJsonPath + ' (' + e.message + ')');
  process.exit(2);
}
const bundles =
  parsed && parsed.dsh && parsed.dsh.profile && Array.isArray(parsed.dsh.profile.bundles)
    ? parsed.dsh.profile.bundles
    : null;
if (bundles && bundles.indexOf(pkg) !== -1) {
  console.log('ok: dsh.profile.bundles contains ' + pkg);
  process.exit(0);
}
err2('dsh.profile.bundles 不含 ' + pkg + '（当前: ' + JSON.stringify(bundles) + '）');
process.exit(1);
