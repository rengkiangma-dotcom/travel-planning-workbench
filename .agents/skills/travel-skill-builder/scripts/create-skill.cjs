#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [name, ...descriptionParts] = process.argv.slice(2);
const description = descriptionParts.join(' ').trim();
if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64 || !description || /[\r\n]/.test(description)) {
  console.error('用法：node .agents/skills/travel-skill-builder/scripts/create-skill.cjs <英文名称> <中文用途>');
  console.error('名称只允许小写字母、数字和连字符，最长 64 字符；用途须为非空单行文字。');
  process.exit(1);
}

const skillsRoot = path.resolve(__dirname, '../..');
const target = path.join(skillsRoot, name);
try {
  fs.mkdirSync(target);
  const content = `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n\n请根据实际场景补充工作流程、约束和验证方法，再开始使用。\n`;
  fs.writeFileSync(path.join(target, 'SKILL.md'), content, { encoding: 'utf8', flag: 'wx' });
  console.log(`已创建 ${target}，请完善 SKILL.md 后再使用。`);
} catch (error) {
  console.error(error.code === 'EEXIST' ? `目录已存在，未覆盖：${target}` : `创建失败：${error.message}`);
  process.exit(1);
}
