#!/usr/bin/env node
'use strict';
/*
 * cordis.patch.yml 旧手动挂载块清理（install.sh / install.ps1 共用）。
 *
 * 用法：node strip-mount.cjs <cordis.patch.yml> <pluginId>
 *
 * 删除形如 `- insert:` 且块内含 `id: <pluginId>` 的整块（含缩进更深的子行，
 * 直至出现同缩进或更浅缩进的行），并连同块上方紧邻的注释行一起移除。
 * 幂等：无匹配块时不写文件。写后立即回读断言，失败回滚原内容并以非零码退出。
 *
 * 匹配形态（与 dsh-ssh-tunnel 仓库根 cordis.patch.yml 同构）：
 *   - insert:
 *       - id: ssh-tunnel
 *         name: dsh-ssh-tunnel
 */
const fs = require('fs');

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fail(msg) {
  process.stderr.write('[strip-mount] ' + msg + '\n');
  process.exit(1);
}

function indentOf(line) {
  const m = line.match(/^([ \t]*)/);
  return m ? m[1].length : 0;
}

// 返回所有「含 id 的 insert 块」的 [start, end) 行区间
function findBlocks(lines, id) {
  const idRe = new RegExp('id:[ \\t]*' + escapeRe(id) + '\\b');
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^[ \t]*- insert:[ \t]*$/.test(lines[i])) continue;
    const startIndent = indentOf(lines[i]);
    let j = i + 1;
    while (
      j < lines.length &&
      lines[j].trim() !== '' &&
      indentOf(lines[j]) > startIndent
    ) {
      j++;
    }
    if (idRe.test(lines.slice(i, j).join('\n'))) blocks.push([i, j]);
    i = j - 1;
  }
  return blocks;
}

function removeBlocks(lines, blocks) {
  const remove = new Set();
  for (const range of blocks) {
    for (let k = range[0]; k < range[1]; k++) remove.add(k);
  }
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (remove.has(i)) {
      // 移除块上方紧邻的注释行
      while (out.length && /^[ \t]*#/.test(out[out.length - 1])) out.pop();
      continue;
    }
    out.push(lines[i]);
  }
  return out;
}

const file = process.argv[2];
const id = process.argv[3];
if (!file || !id || process.argv.length !== 4) {
  process.stderr.write('用法: node strip-mount.cjs <cordis.patch.yml> <pluginId>\n');
  process.exit(2);
}

let original;
try {
  original = fs.readFileSync(file, 'utf8');
} catch (e) {
  fail('读取失败: ' + e.message);
}

const lines = original.split('\n');
const blocks = findBlocks(lines, id);
if (blocks.length === 0) {
  console.log('none');
  process.exit(0);
}

const updated = removeBlocks(lines, blocks).join('\n');
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
if (findBlocks(readback.split('\n'), id).length !== 0) {
  try {
    fs.writeFileSync(file, original, 'utf8');
  } catch (e2) {
    fail('回读断言失败且回滚也失败，请手动检查该文件: ' + e2.message);
  }
  fail('回读断言失败（id: ' + id + ' 的挂载块仍在），已回滚为原内容。');
}
console.log('removed');
