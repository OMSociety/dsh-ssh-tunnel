#!/usr/bin/env node
'use strict';
/*
 * pnpm-workspace.yaml 的 minimumReleaseAgeExclude 维护（install.sh / install.ps1 共用）。
 *
 * 用法：
 *   node ws-exclude.cjs <pnpm-workspace.yaml> <pkg>
 *       写模式：列表缺失 pkg 时追加（幂等）；写后立即回读断言，
 *       断言失败回滚原内容并以非零码退出。
 *   node ws-exclude.cjs --check <pnpm-workspace.yaml> <pkg>
 *       检查模式：已包含退出 0（打印 present），否则退出 1（打印 absent）。
 *
 * 「已存在」判定：任意列表项形如 <pkg> 或 <pkg>@<版本/区间>（pkg + '@' 前缀匹配），
 * 例如 pkg=dsh-ssh-tunnel 时，`- dsh-ssh-tunnel` 与 `- dsh-ssh-tunnel@1.0.0` 都算已存在。
 */
const fs = require('fs');

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fail(msg) {
  process.stderr.write('[ws-exclude] ' + msg + '\n');
  process.exit(1);
}

function hasEntry(text, pkg) {
  const re = new RegExp(
    '^[ \\t]*-[ \\t]+' + escapeRe(pkg) + '(?:@[^\\n]*)?[ \\t]*(?:#.*)?$',
    'm'
  );
  return re.test(text);
}

function buildUpdated(text, pkg) {
  const lines = text.split('\n');
  let headerIdx = -1;
  let baseIndent = '';
  let inlineRest = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([ \t]*)minimumReleaseAgeExclude:(.*)$/);
    if (m) {
      headerIdx = i;
      baseIndent = m[1];
      inlineRest = m[2].trim();
      break;
    }
  }

  if (headerIdx === -1) {
    // 没有 exclude 段：在文件末尾追加新段
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push('minimumReleaseAgeExclude:', '  - ' + pkg, '');
    return lines.join('\n');
  }

  if (inlineRest && inlineRest !== '[]') {
    fail('minimumReleaseAgeExclude 是内联形式（' + inlineRest + '），不支持自动改写，请手动编辑。');
  }
  if (inlineRest === '[]') {
    // 空列表内联形式展开为块列表
    lines[headerIdx] = baseIndent + 'minimumReleaseAgeExclude:';
  }

  // 子项缩进取段内首个列表项的缩进，缺省在段键缩进基础上加两格
  let childIndent = baseIndent + '  ';
  for (let j = headerIdx + 1; j < lines.length; j++) {
    if (lines[j].trim() === '') continue;
    const im = lines[j].match(/^([ \t]*)-[ \t]/);
    if (im) childIndent = im[1];
    break;
  }
  lines.splice(headerIdx + 1, 0, childIndent + '- ' + pkg);
  return lines.join('\n');
}

const argv = process.argv.slice(2);
let mode = 'write';
if (argv[0] === '--check') {
  mode = 'check';
  argv.shift();
}
const file = argv[0];
const pkg = argv[1];
if (!file || !pkg || argv.length !== 2) {
  process.stderr.write('用法: node ws-exclude.cjs [--check] <pnpm-workspace.yaml> <pkg>\n');
  process.exit(2);
}

let original;
try {
  original = fs.readFileSync(file, 'utf8');
} catch (e) {
  if (mode === 'check') {
    process.stderr.write('[ws-exclude] 文件不存在或不可读: ' + file + '\n');
    process.exit(2);
  }
  fail('读取失败: ' + e.message);
}

if (mode === 'check') {
  if (hasEntry(original, pkg)) {
    console.log('present');
    process.exit(0);
  }
  console.log('absent');
  process.exit(1);
}

if (hasEntry(original, pkg)) {
  console.log('unchanged');
  process.exit(0);
}

let updated;
try {
  updated = buildUpdated(original, pkg);
} catch (e) {
  fail('构造更新内容失败: ' + e.message + '（文件未做任何修改）');
}

try {
  fs.writeFileSync(file, updated, 'utf8');
} catch (e) {
  fail('写入失败: ' + e.message + '（文件保持原样，未做任何修改）');
}

// 写后立即回读断言；失败则回滚原内容并退出非零
let readback = '';
try {
  readback = fs.readFileSync(file, 'utf8');
} catch (e) {
  fail('回读失败: ' + e.message);
}
if (!hasEntry(readback, pkg)) {
  try {
    fs.writeFileSync(file, original, 'utf8');
  } catch (e2) {
    fail('回读断言失败且回滚也失败，请手动检查该文件: ' + e2.message);
  }
  fail('回读断言失败（写后内容缺少期望条目 ' + pkg + '），已回滚为原内容。');
}
console.log('updated');
