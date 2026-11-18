const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const backup = require('./backup.cjs');

async function tmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'lvji-backup-'));
}

test('内容没变不重复写快照，变了就写新快照', async () => {
  const dir = await tmpDir();
  const first = await backup.save({ a: 1 }, { dir, now: new Date('2026-11-13T10:00:00') });
  const same = await backup.save({ a: 1 }, { dir, now: new Date('2026-11-13T10:05:00') });
  const changed = await backup.save({ a: 2 }, { dir, now: new Date('2026-11-13T10:10:00') });
  assert.equal(first.saved, true);
  assert.equal(same.saved, false);
  assert.equal(changed.saved, true);
  assert.equal((await backup.history(dir)).length, 2);
  await fs.rm(dir, { recursive: true, force: true });
});

test('只切换页面不重复保存，行程内容变化仍保存', async () => {
  const dir = await tmpDir();
  await backup.save({ destination: '杭州', section: 'traffic' }, { dir, now: new Date('2026-11-13T10:00:00') });
  const same = await backup.save({ destination: '杭州', section: 'stay' }, { dir, now: new Date('2026-11-13T10:05:00') });
  const changed = await backup.save({ destination: '苏州', section: 'stay' }, { dir, now: new Date('2026-11-13T10:10:00') });
  assert.equal(same.saved, false);
  assert.equal(changed.saved, true);
  assert.equal((await backup.history(dir)).length, 2);
  await fs.rm(dir, { recursive: true, force: true });
});

test('同一次旅行更新原记录，不同旅行即使目的地相同也分开保存', async () => {
  const dir = await tmpDir();
  const first = await backup.save({ tripId: 'trip-1', destination: '杭州', notes: '初稿' }, { dir, now: new Date('2026-11-13T10:00:00') });
  await backup.save({ tripId: 'trip-2', destination: '杭州', notes: '另一趟' }, { dir, now: new Date('2026-11-13T10:05:00') });
  await backup.save({ tripId: 'trip-1', destination: '杭州', notes: '修改后' }, { dir, now: new Date('2026-11-13T10:10:00') });
  assert.equal((await backup.history(dir)).length, 2);
  assert.equal((await backup.read(first.file, dir)).notes, '修改后');
  await fs.rm(dir, { recursive: true, force: true });
});

test('恢复旧记录后保存更新原文件', async () => {
  const dir = await tmpDir();
  const old = await backup.save({ destination: '杭州', notes: '旧版' }, { dir });
  await backup.save({ tripId: `legacy:${old.file}`, destination: '杭州', notes: '新版' }, { dir });
  assert.equal((await backup.history(dir)).length, 1);
  assert.equal((await backup.read(old.file, dir)).notes, '新版');
  await fs.rm(dir, { recursive: true, force: true });
});

test('超过保留份数删最旧的', async () => {
  const dir = await tmpDir();
  for (let i = 0; i < 5; i += 1) {
    await backup.save({ i }, { dir, limit: 3, now: new Date(Date.UTC(2026, 10, 13, 10, i)) });
  }
  const items = await backup.history(dir);
  assert.equal(items.length, 3);
  assert.equal((await backup.read(items[0].file, dir)).i, 4);
  await fs.rm(dir, { recursive: true, force: true });
});

test('只允许读取快照文件名，拒绝路径穿越', async () => {
  const dir = await tmpDir();
  await backup.save({ ok: true }, { dir });
  const [item] = await backup.history(dir);
  assert.equal((await backup.read(item.file, dir)).ok, true);
  await assert.rejects(() => backup.read('../secret.json', dir), /文件名无效/);
  await assert.rejects(() => backup.read('nope.json', dir), /文件名无效/);
  await fs.rm(dir, { recursive: true, force: true });
});

test('拒绝非对象内容', async () => {
  await assert.rejects(() => backup.save([1, 2, 3]), /备份内容无效/);
  await assert.rejects(() => backup.save(null), /备份内容无效/);
});

test('列表带行程摘要，坏文件不影响其他条目', async () => {
  const dir = await tmpDir();
  await backup.save({ destination: '杭州', days: 3, people: 2, plans: [['a'], ['b', 'c']] }, { dir, now: new Date(Date.UTC(2026, 10, 13, 10, 0)) });
  await backup.save({ destination: '苏州', days: 2, people: 1, plans: [[]] }, { dir, now: new Date(Date.UTC(2026, 10, 13, 11, 0)) });
  await fs.writeFile(path.join(dir, '2026-11-13T12-00-00-000.json'), '{坏数据');
  const items = await backup.list(dir);
  assert.equal(items.length, 3);
  assert.equal(items[0].summary, null);
  assert.equal(items[1].summary.destination, '苏州');
  assert.equal(items[2].summary.title, '杭州之旅');
  assert.equal(items[2].summary.places, 3);
  await fs.rm(dir, { recursive: true, force: true });
});

test('可以删除指定快照，删不存在的返回错误', async () => {
  const dir = await tmpDir();
  await backup.save({ destination: '杭州' }, { dir });
  const [item] = await backup.history(dir);
  assert.deepEqual(await backup.remove(item.file, dir), { ok: true });
  assert.equal((await backup.history(dir)).length, 0);
  await assert.rejects(() => backup.remove(item.file, dir), /备份不存在/);
  await fs.rm(dir, { recursive: true, force: true });
});

test('历史快照删光后再保存相同内容，仍会写新快照', async () => {
  const dir = await tmpDir();
  await backup.save({ destination: '杭州' }, { dir });
  const [item] = await backup.history(dir);
  await backup.remove(item.file, dir);
  const again = await backup.save({ destination: '杭州' }, { dir });
  assert.equal(again.saved, true);
  assert.equal((await backup.history(dir)).length, 1);
  await fs.rm(dir, { recursive: true, force: true });
});
