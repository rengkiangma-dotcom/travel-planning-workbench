/* 自动备份：每次有变化写一份快照，保留最近 N 份，另存 latest.json 便于恢复。 */
const fs = require('node:fs/promises');
const path = require('node:path');

const LIMIT = 40;
const NAME = /^\d{4}-\d{2}-\d{2}T[\d-]+\.json$/;

function dirOf(dir) {
  return dir || process.env.LVJI_BACKUP_DIR || path.join(__dirname, '备份');
}

function stamp(date = new Date()) {
  const pad = (n, size = 2) => String(n).padStart(size, '0');
  return [
    date.getFullYear(), '-', pad(date.getMonth() + 1), '-', pad(date.getDate()),
    'T', pad(date.getHours()), '-', pad(date.getMinutes()), '-', pad(date.getSeconds()), '-', pad(date.getMilliseconds(), 3),
    '.json',
  ].join('');
}

async function history(dir) {
  const base = dirOf(dir);
  let names = [];
  try {
    names = (await fs.readdir(base)).filter((name) => NAME.test(name));
  } catch {
    return [];
  }
  const items = await Promise.all(names.map(async (name) => {
    const info = await fs.stat(path.join(base, name));
    return { file: name, at: info.mtime.toISOString(), bytes: info.size };
  }));
  return items.sort((a, b) => (a.at < b.at ? 1 : -1));
}

function summarize(state) {
  if (!state || typeof state !== 'object') return null;
  const plans = Array.isArray(state.plans) ? state.plans : [];
  return {
    title: String(state.tripName || '').trim() || `${state.destination || '未命名'}之旅`,
    origin: String(state.origin || ''),
    destination: String(state.destination || ''),
    start: String(state.start || ''),
    days: Number(state.days) || 0,
    people: Number(state.people) || 0,
    places: plans.flat().length,
  };
}

async function list(dir) {
  const base = dirOf(dir);
  const items = await history(base);
  return Promise.all(items.map(async (item) => {
    let summary = null;
    try {
      summary = summarize(JSON.parse(await fs.readFile(path.join(base, item.file), 'utf8')));
    } catch {
      summary = null;
    }
    return { ...item, summary };
  }));
}

async function prune(base, limit) {
  const items = await history(base);
  for (const item of items.slice(limit)) {
    await fs.unlink(path.join(base, item.file)).catch(() => {});
  }
}

function comparable(state) {
  const { section, ...trip } = state;
  return JSON.stringify(trip);
}

async function save(state, options = {}) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw Object.assign(new Error('备份内容无效'), { status: 400 });
  }
  const base = dirOf(options.dir);
  const limit = options.limit || LIMIT;
  const now = options.now || new Date();
  const text = JSON.stringify(state, null, 2);
  await fs.mkdir(base, { recursive: true });
  const latest = path.join(base, 'latest.json');
  let previous = null;
  const items = await history(base);
  if (typeof state.tripId === 'string' && state.tripId) {
    for (const item of items) {
      let existing;
      try {
        existing = JSON.parse(await fs.readFile(path.join(base, item.file), 'utf8'));
      } catch (error) {
        if (error instanceof SyntaxError || error.code === 'ENOENT') continue;
        throw error;
      }
      if (existing.tripId !== state.tripId && !(state.tripId === `legacy:${item.file}` && !existing.tripId)) continue;
      const target = path.join(base, item.file);
      const temporary = path.join(base, `${item.file}.${require('node:crypto').randomUUID()}.tmp`);
      try {
        await fs.writeFile(temporary, text, { mode: 0o600, flag: 'wx' });
        await fs.rename(temporary, target);
      } finally {
        await fs.unlink(temporary).catch(() => {});
      }
      await fs.writeFile(latest, text, { mode: 0o600 });
      return { saved: true, at: now.toISOString(), file: item.file, dir: base, count: items.length };
    }
  }
  if (items.length) {
    try {
      previous = await fs.readFile(path.join(base, items[0].file), 'utf8');
    } catch {
      previous = null;
    }
  }
  let unchanged = false;
  try {
    unchanged = previous !== null && comparable(JSON.parse(previous)) === comparable(state);
  } catch {
    unchanged = false;
  }
  if (unchanged) {
    await fs.writeFile(latest, text, { mode: 0o600 });
    return { saved: false, at: now.toISOString(), file: null, dir: base, count: items.length };
  }
  const file = stamp(now);
  await fs.writeFile(path.join(base, file), text, { mode: 0o600 });
  await fs.writeFile(latest, text, { mode: 0o600 });
  await prune(base, limit);
  return { saved: true, at: now.toISOString(), file, dir: base, count: (await history(base)).length };
}

async function read(name, dir) {
  if (!NAME.test(String(name || ''))) {
    throw Object.assign(new Error('备份文件名无效'), { status: 400 });
  }
  const base = dirOf(dir);
  const file = path.resolve(base, name);
  if (!file.startsWith(path.resolve(base) + path.sep)) {
    throw Object.assign(new Error('备份路径无效'), { status: 400 });
  }
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    throw Object.assign(new Error('备份不存在或已损坏'), { status: 404 });
  }
}

async function remove(name, dir) {
  if (!NAME.test(String(name || ''))) {
    throw Object.assign(new Error('备份文件名无效'), { status: 400 });
  }
  const base = dirOf(dir);
  const file = path.resolve(base, name);
  if (!file.startsWith(path.resolve(base) + path.sep)) {
    throw Object.assign(new Error('备份路径无效'), { status: 400 });
  }
  try {
    await fs.unlink(file);
  } catch {
    throw Object.assign(new Error('备份不存在'), { status: 404 });
  }
  return { ok: true };
}

module.exports = { save, history, list, read, remove, stamp, dirOf, summarize, LIMIT };
