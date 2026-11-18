# Vue 3 迁移第一阶段：地基与工作台外壳 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Vue 3 + Vite 搭出新前端的地基（领域纯函数、Pinia 状态、入口页、工作台外壳、预算摘要），跑在 `/next/` 下，与旧版并存；旧版仍是默认入口，直到后续计划逐个板块迁完。

**Architecture:** 新前端是独立 Vite 工程（源码 `src/`，构建产物 `next/`），通过同一个 localStorage 键 `xingjian-lvji-preview-v1` 读写与旧版完全一致的状态，通过同一个本地服务访问 `/api`。领域逻辑（金额、报价、状态归一、预算）是纯 ESM 模块，用 Vitest 单测；界面用 Vue SFC；验收沿用 Playwright + 本机 Edge。

**Tech Stack:** Vue 3.5.45、Vite 8.3.8、Pinia 4.1.0、@vitejs/plugin-vue 6.0.11、Vitest 5.1.0、Node 24、Playwright（已有 `验证工具/`）。

---

## 背景与边界

### 为什么要换

旧前端是 120KB 无构建脚本：`app.js` 34KB 同时管状态、持久化、渲染和预算；`render()` 被 5 个文件依次包裹（`create-entry` → `workspace` → `live-data` → `amap-map` → `map-interactions`）；82 处直接改全局 `state`，48 处手写 `save()`；前端零单测。换框架解决的是这三件事：组件边界、响应式更新、可单测的领域层。

### 本计划做

- 新建 `src/` Vite 工程，构建到 `next/`，由现有 `server.cjs` 托管在 `/next/`。
- 领域层：`money`、`quote`、`state`、`budget` 四个纯模块 + Vitest 单测。
- 状态层：一个 Pinia store，读写与旧版相同的 localStorage 键。
- 界面：入口页（新建/已有两种分支）、工作台外壳（顶部、导航、面板、预算摘要、地图占位）。
- 验收：`验证工具/check-next-shell.cjs`。

### 本计划不做

- 不做地图。右侧地图区只放占位说明 + 「回旧版看地图」链接。**计划 B**。
- 不做交通、住宿、地点、每日安排四个面板，导航可点但显示「尚未迁移」。**计划 C/D**。
- 不改旧文件（`app.js`、`live-data.js` 等一行不动），只给 `server.cjs` 加一条目录回退。
- 不改 localStorage 数据结构，不提高 `version`。
- 不追求像素级视觉一致；样式复用旧 CSS，截图后按实际效果微调（Task 8 有一步专门做这件事）。

### 迁移总路线（本计划只做第 1 阶段）

| 阶段 | 内容 | 交付 |
|---|---|---|
| **1（本计划）** | 地基 + 入口 + 外壳 + 预算摘要 | `/next/` 可建行程、可看摘要，旧版不受影响 |
| 2 | 地图端口（AMap + Leaflet）+ 地点/收藏面板 | `/next/` 能搜地点、看候选星标 |
| 3 | 每日行程 + 当天路线 + 交通 + 住宿 | `/next/` 功能对齐旧版 |
| 4 | 报价层替换预算、切换默认入口、删除旧前端 | `/` 指向新前端，旧代码归档 |

每阶段结束都必须让旧版仍可用；第 4 阶段才允许删代码。

---

## 目标结构

```
旅迹风格预览/
  src/
    main.js
    App.vue
    styles/index.css
    data/demo.js              ← 由 data.js 转成 ESM，内容照搬
    domain/
      money.js  money.spec.js
      quote.js  quote.spec.js
      state.js  state.spec.js
      budget.js budget.spec.js
    stores/trip.js  trip.spec.js
    components/
      EntryScreen.vue
      Workspace.vue
      BudgetSummary.vue
      panels/OverviewPanel.vue
      panels/OriginalPanel.vue
      panels/PanelPlaceholder.vue
  next.html                   ← Vite 入口
  vite.config.js
  package.json                ← 增加 vue / vite / pinia / vitest 与脚本
  next/                       ← 构建产物，加入 .gitignore
```

### 加载与运行

- 开发：`npm run dev` → `http://127.0.0.1:5173/next.html`，`/api` 代理到 `127.0.0.1:18647`。
- 构建：`npm run build` → `旅迹风格预览/next/`。
- 使用：`http://127.0.0.1:18647/next/`（`server.cjs` 目录回退到 `index.html`）。
- 旧版：`http://127.0.0.1:18647/` 不变。

---

## 契约

### 1. 状态

- localStorage 键固定 `xingjian-lvji-preview-v1`，结构与旧版逐字段一致，`version: 1`。
- 任何字段缺失都按 `fresh()` 补齐，不删除旧版写入的未知字段。
- 新前端**只通过 store action 改状态**，组件不允许直接写 `trip.xxx = ...`。

### 2. 金额与报价

- 金额统一「分」的整数；`null` 表示未知，绝不参与相加。
- 报价五态：`realQuote`、`quoteSnapshot`、`estimate`、`unknown`、`paid`。
- `unknown` 必须带 `note`；非 `unknown` 缺金额直接抛错。

### 3. DOM 契约（保证旧验收脚本可继续用）

新前端保留这些选择器与文案：`#trip-title`、`#trip-meta`、`#panel`、`.nav-item[data-section]`、`.compact-summary`、`#map-toggle`、`#map-panel`、`.field`、`.button`。第 4 阶段切默认时，旧脚本应当只改 BASE 地址就能跑。

### 4. 测试命名

- `*.cjs` + `node --test`：旧脚本与 `providers.test.cjs`（保持不变）。
- `*.spec.js` + `vitest run`：新前端单测。**不要用 `.test.js`**，否则 `node --test` 会误跑它们。

---

## Task 1: Vite 工程与依赖

**Files:**
- Modify: `旅迹风格预览/package.json`
- Create: `旅迹风格预览/vite.config.js`
- Modify: `.gitignore`

- [x] **Step 1: 改 package.json**

```json
{
  "name": "xingjian-lvji",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "node --test",
    "test:unit": "vitest run",
    "test:all": "node --test && vitest run"
  },
  "dependencies": {
    "coordtransform": "^2.1.2",
    "pinia": "^4.1.0",
    "vue": "^3.5.45"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.11",
    "vite": "^8.3.8",
    "vitest": "^5.1.0"
  }
}
```

- [x] **Step 2: 安装**

Run: `cd 'E:\旅游规划工作台制作\旅迹风格预览'; npm install`
Expected: 生成 `node_modules/` 与新的 `package-lock.json`，结尾 `added ... packages`，无 `ERESOLVE`

- [x] **Step 3: 写 vite.config.js**

```js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ command }) => ({
  plugins: [vue()],
  base: command === 'build' ? '/next/' : '/',
  build: {
    outDir: 'next',
    emptyOutDir: true,
    rollupOptions: { input: { index: 'next.html' } },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:18647' },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.js'],
  },
}));
```

- [x] **Step 4: 忽略构建产物**

在根 `.gitignore` 末尾追加：

```
旅迹风格预览/next/
```

- [x] **Step 5: 提交**

```bash
git add 旅迹风格预览/package.json 旅迹风格预览/package-lock.json 旅迹风格预览/vite.config.js .gitignore
git commit -m "chore: 引入 Vue 3 + Vite + Pinia 工程"
```
---

## Task 2: 金额领域模块

**Files:**
- Create: `旅迹风格预览/src/domain/money.js`
- Create: `旅迹风格预览/src/domain/money.spec.js`

- [x] **Step 1: 写失败的测试**

```js
// 旅迹风格预览/src/domain/money.spec.js
import { describe, it, expect } from 'vitest';
import { toMinor, sumMinor, formatYuan } from './money.js';

describe('money', () => {
  it('元转分四舍五入到整数', () => {
    expect(toMinor(120.5)).toBe(12050);
    expect(toMinor('12.34')).toBe(1234);
    expect(toMinor(0)).toBe(0);
  });

  it('未知金额保持 null，不当 0', () => {
    expect(toMinor(null)).toBeNull();
    expect(toMinor(undefined)).toBeNull();
    expect(toMinor('')).toBeNull();
    expect(toMinor('abc')).toBeNull();
  });

  it('先各自换算再相加，避免浮点误差', () => {
    expect(sumMinor([toMinor(0.1), toMinor(0.2)])).toBe(30);
    expect(sumMinor([null, 100, undefined])).toBe(100);
  });

  it('按分显示，未知显示待查', () => {
    expect(formatYuan(300000)).toBe('¥3,000');
    expect(formatYuan(12050)).toBe('¥120.5');
    expect(formatYuan(null)).toBe('待查');
  });
});
```

- [x] **Step 2: 运行，确认失败**

Run: `cd 'E:\旅游规划工作台制作\旅迹风格预览'; npx vitest run src/domain/money.spec.js`
Expected: FAIL，`Failed to resolve import "./money.js"`

- [x] **Step 3: 写实现**

```js
// 旅迹风格预览/src/domain/money.js
/* 金额一律换算成「分」的整数再相加；未知保持 null，绝不按 0 处理。 */

export function toMinor(amount) {
  if (amount === null || amount === undefined || amount === '') return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function sumMinor(list) {
  return list.reduce((sum, v) => (v === null || v === undefined ? sum : sum + v), 0);
}

export function formatYuan(minor) {
  if (minor === null || minor === undefined) return '待查';
  return '¥' + (minor / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
```

- [x] **Step 4: 运行，确认通过**

Run: `npx vitest run src/domain/money.spec.js`
Expected: `Test Files 1 passed (1)`、`Tests 4 passed (4)`

- [x] **Step 5: 提交**

```bash
git add 旅迹风格预览/src/domain/money.js 旅迹风格预览/src/domain/money.spec.js
git commit -m "feat(domain): 金额按分计算，未知不按零"
```

---

## Task 3: 报价领域模块

**Files:**
- Create: `旅迹风格预览/src/domain/quote.js`
- Create: `旅迹风格预览/src/domain/quote.spec.js`

- [x] **Step 1: 写失败的测试**

```js
// 旅迹风格预览/src/domain/quote.spec.js
import { describe, it, expect } from 'vitest';
import { makeQuote, lineTotalMinor, summarize } from './quote.js';

const base = {
  category: 'rail', source: '12306', kind: 'realQuote',
  amount: 553, currency: 'CNY', unit: 'perPerson', quantity: 1,
  queriedAt: '2026-11-13T07:00:00.000Z', validFor: '2026-11-14 G1234', note: '',
};

describe('quote', () => {
  it('真实报价换算成分并保留来源与时间', () => {
    const q = makeQuote(base);
    expect(q.amount).toBe(55300);
    expect(q.source).toBe('12306');
    expect(q.queriedAt).toBe('2026-11-13T07:00:00.000Z');
  });

  it('未知报价必须带原因，金额为 null', () => {
    const q = makeQuote({ category: 'admission', kind: 'unknown', unit: 'total', note: '门票价格未核实', source: 'user' });
    expect(q.amount).toBeNull();
    expect(q.kind).toBe('unknown');
    expect(() => makeQuote({ category: 'admission', kind: 'unknown', unit: 'total' })).toThrow(/原因/);
  });

  it('非未知报价缺金额或单位非法直接报错', () => {
    expect(() => makeQuote({ ...base, amount: null })).toThrow(/金额/);
    expect(() => makeQuote({ ...base, unit: 'perNight' })).toThrow(/计价单位/);
    expect(() => makeQuote({ ...base, kind: 'guess' })).toThrow(/报价类型/);
  });

  it('按单位计价：人数、房间夜、车辆', () => {
    const perPerson = makeQuote({ ...base, amount: 100, unit: 'perPerson', quantity: 1 });
    expect(lineTotalMinor(perPerson, { people: 2, rooms: 1, nights: 1 })).toBe(20000);
    const perRoom = makeQuote({ ...base, category: 'lodging', amount: 368, unit: 'perRoomNight', quantity: 1 });
    expect(lineTotalMinor(perRoom, { people: 2, rooms: 2, nights: 3 })).toBe(368 * 2 * 3 * 100);
    const perVehicle = makeQuote({ ...base, category: 'localTransit', amount: 40, unit: 'perVehicle', quantity: 2 });
    expect(lineTotalMinor(perVehicle, { people: 5, rooms: 1, nights: 1 })).toBe(8000);
  });

  it('汇总时未知不计入总额，但单独计数', () => {
    const known = makeQuote({ ...base, amount: 553 });
    const unknown = makeQuote({ category: 'admission', kind: 'unknown', unit: 'total', note: '门票待查', source: 'user' });
    const result = summarize([known, unknown], { people: 2, rooms: 1, nights: 2 });
    expect(result.totalMinor).toBe(110600);
    expect(result.unknownCount).toBe(1);
    expect(result.byCategory.rail).toBe(110600);
  });
});
```

- [x] **Step 2: 运行，确认失败**

Run: `npx vitest run src/domain/quote.spec.js`
Expected: FAIL，`Failed to resolve import "./quote.js"`

- [x] **Step 3: 写实现**

```js
// 旅迹风格预览/src/domain/quote.js
/* 报价五态与按单位计价；未知是合法状态，不是缺省值。 */
import { toMinor } from './money.js';

export const CATEGORIES = ['rail', 'lodging', 'localTransit', 'admission', 'meal', 'other'];
export const KINDS = ['realQuote', 'quoteSnapshot', 'estimate', 'unknown', 'paid'];
export const UNITS = ['perPerson', 'perRoomNight', 'perVehicle', 'total'];

export function makeQuote(input) {
  if (!input || typeof input !== 'object') throw new Error('报价必须是对象');
  if (!KINDS.includes(input.kind)) throw new Error('报价类型不合法：' + input.kind);
  if (!UNITS.includes(input.unit)) throw new Error('计价单位不合法：' + input.unit);

  const kind = input.kind;
  const category = CATEGORIES.includes(input.category) ? input.category : 'other';
  let amount = null;

  if (kind === 'unknown') {
    if (!String(input.note || '').trim()) throw new Error('未知报价必须写明原因');
  } else {
    amount = toMinor(input.amount);
    if (amount === null) throw new Error('报价金额无法换算，请显式标为 unknown 并写明原因');
  }

  return {
    category,
    source: String(input.source || 'user'),
    kind,
    amount,
    currency: input.currency || 'CNY',
    unit: input.unit,
    quantity: Number.isInteger(input.quantity) && input.quantity > 0 ? input.quantity : 1,
    people: Number.isInteger(input.people) ? input.people : null,
    rooms: Number.isInteger(input.rooms) ? input.rooms : null,
    queriedAt: input.queriedAt || null,
    validFor: input.validFor || '',
    note: input.note || '',
  };
}

export function lineTotalMinor(quote, ctx) {
  if (!quote || quote.kind === 'unknown' || quote.amount === null) return null;
  const people = ctx.people ?? 1;
  const rooms = ctx.rooms ?? 1;
  const nights = ctx.nights ?? 1;
  const quantity = quote.quantity ?? 1;

  if (quote.unit === 'perPerson') return quote.amount * people * quantity;
  if (quote.unit === 'perRoomNight') return quote.amount * rooms * nights * quantity;
  if (quote.unit === 'perVehicle') return quote.amount * quantity;
  if (quote.unit === 'total') return quote.amount * quantity;
  return null;
}

export function summarize(quotes, ctx) {
  const byCategory = {};
  let totalMinor = 0;
  const unknown = [];
  for (const quote of quotes) {
    const line = lineTotalMinor(quote, ctx);
    if (line === null) { unknown.push(quote); continue; }
    totalMinor += line;
    byCategory[quote.category] = (byCategory[quote.category] || 0) + line;
  }
  return { totalMinor, byCategory, unknownCount: unknown.length, unknown };
}
```

- [x] **Step 4: 运行，确认通过**

Run: `npx vitest run src/domain/quote.spec.js`
Expected: `Tests 5 passed (5)`

- [x] **Step 5: 提交**

```bash
git add 旅迹风格预览/src/domain/quote.js 旅迹风格预览/src/domain/quote.spec.js
git commit -m "feat(domain): 报价五态与按单位计价"
```

---

## Task 4: 状态归一与读写

**Files:**
- Create: `旅迹风格预览/src/domain/state.js`
- Create: `旅迹风格预览/src/domain/state.spec.js`

- [x] **Step 1: 写失败的测试**

```js
// 旅迹风格预览/src/domain/state.spec.js
import { describe, it, expect, beforeEach } from 'vitest';
import { fresh, normalize, load, save, STORAGE_KEY, SECTIONS } from './state.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

describe('state', () => {
  it('空值与坏 JSON 都回到完整默认值', () => {
    const base = normalize(null);
    expect(base.started).toBe(false);
    expect(base.days).toBe(3);
    expect(base.plans).toEqual([[], [], []]);
    expect(base.version).toBe(1);
    expect(normalize('not-an-object').started).toBe(false);
  });

  it('天数与分组数不一致时整体回退，不做半截修补', () => {
    const bad = { ...fresh(), started: true, days: 3, plans: [[]] };
    expect(normalize(bad).started).toBe(false);
  });

  it('越界的天号和未知板块被夹回合法值', () => {
    const raw = { ...fresh(), started: true, days: 3, day: 9, section: 'nope', plans: [[], [], []] };
    const state = normalize(raw);
    expect(state.day).toBe(2);
    expect(state.section).toBe('overview');
    expect(SECTIONS.some((s) => s.id === 'days')).toBe(true);
  });

  it('保留旧版写入的扩展字段', () => {
    const raw = {
      ...fresh(), started: true, days: 2, plans: [[], []],
      liveTickets: { signature: 'x', outbound: { train: 'G1' } },
      mapStay: { name: '湖滨' }, leftView: 'chat',
    };
    const state = normalize(raw);
    expect(state.liveTickets.outbound.train).toBe('G1');
    expect(state.mapStay.name).toBe('湖滨');
    expect(state.leftView).toBe('chat');
  });

  it('读写使用同一个键，能原样读回', () => {
    const storage = memoryStorage();
    const state = normalize({ ...fresh(), started: true, days: 2, plans: [[], []], budget: 4321 });
    save(state, storage);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)).budget).toBe(4321);
    expect(load(storage).budget).toBe(4321);
  });

  it('存储抛错时不崩溃，返回默认值', () => {
    const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(load(storage).started).toBe(false);
    expect(() => save(fresh(), storage)).not.toThrow();
  });
});
```

- [x] **Step 2: 运行，确认失败**

Run: `npx vitest run src/domain/state.spec.js`
Expected: FAIL，`Failed to resolve import "./state.js"`

- [x] **Step 3: 写实现**

```js
// 旅迹风格预览/src/domain/state.js
/* 与旧版共用同一个 localStorage 键和同一份字段结构。 */

export const STORAGE_KEY = 'xingjian-lvji-preview-v1';

export const SECTIONS = [
  { id: 'overview', label: '旅程概览', icon: '◫' },
  { id: 'traffic', label: '往返交通', icon: '⇄' },
  { id: 'stay', label: '住宿选择', icon: '⌂' },
  { id: 'places', label: '想去的地方', icon: '♧' },
  { id: 'days', label: '每日安排', icon: '☷' },
  { id: 'original', label: '我的需求', icon: '✎' },
];

export function fresh() {
  return {
    version: 1, started: false, entryMode: null, section: 'overview', mapOpen: false, day: 0,
    origin: '上海', destination: '杭州', start: '2026-11-14', days: 3, people: 2, rooms: 1,
    budget: 3000, flexible: true, original: '', notes: '', transport: null, hotel: null,
    mapStay: null, outStatus: '待定', backStatus: '待定',
    plans: [[], [], []], customPlaces: {}, savedPlaces: [], dailyRoutes: {},
    messages: [], undo: [],
  };
}

export function normalize(raw) {
  const base = fresh();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;

  const state = { ...base, ...raw };
  if (!Array.isArray(state.plans) || !state.plans.every(Array.isArray)) return base;
  if (!Number.isInteger(state.days) || state.days < 1 || state.days > 7) return base;
  if (state.plans.length !== state.days) return base;
  if (!Array.isArray(state.messages) || !Array.isArray(state.undo)) return base;

  const day = Number.isInteger(state.day) ? state.day : 0;
  state.day = Math.max(0, Math.min(day, state.days - 1));
  if (!SECTIONS.some((s) => s.id === state.section)) state.section = 'overview';
  if (!state.customPlaces || typeof state.customPlaces !== 'object') state.customPlaces = {};
  if (!Array.isArray(state.savedPlaces)) state.savedPlaces = [];
  if (!state.dailyRoutes || typeof state.dailyRoutes !== 'object') state.dailyRoutes = {};
  return state;
}

export function load(storage = globalThis.localStorage) {
  try {
    return normalize(JSON.parse(storage.getItem(STORAGE_KEY)));
  } catch {
    return fresh();
  }
}

export function save(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
```

- [x] **Step 4: 运行，确认通过**

Run: `npx vitest run src/domain/state.spec.js`
Expected: `Tests 6 passed (6)`

- [x] **Step 5: 提交**

```bash
git add 旅迹风格预览/src/domain/state.js 旅迹风格预览/src/domain/state.spec.js
git commit -m "feat(domain): 状态归一与同键读写"
```

---

## Task 5: 预算领域模块（先照搬旧算法）

**Files:**
- Create: `旅迹风格预览/src/domain/budget.js`
- Create: `旅迹风格预览/src/domain/budget.spec.js`
- Create: `旅迹风格预览/src/data/demo.js`

- [x] **Step 1: 把演示数据转成 ESM**

用命令机械转换，避免手抄票价：

Run: `cd 'E:\旅游规划工作台制作\旅迹风格预览'; E:\node.exe -e "const fs=require('fs');fs.mkdirSync('src/data',{recursive:true});const src=fs.readFileSync('data.js','utf8').replace('window.DEMO =','export const DEMO =');fs.writeFileSync('src/data/demo.js',src)"`

Run: `Select-String -LiteralPath 'src/data/demo.js' -Pattern '^export const DEMO'`
Expected: 命中 `export const DEMO = {`

Run: `E:\node.exe --input-type=module -e "import('./src/data/demo.js').then(m=>console.log(m.DEMO.places.length,m.DEMO.hotels.length,m.DEMO.transport.length))"`
Expected: `9 3 3`

- [x] **Step 2: 写失败的测试**

```js
// 旅迹风格预览/src/domain/budget.spec.js
import { describe, it, expect } from 'vitest';
import { budgetOf } from './budget.js';
import { fresh } from './state.js';

const demo = {
  places: [
    { id: 'free', name: '免费的', cost: 0 },
    { id: 'paid', name: '收费的', cost: 75 },
  ],
  hotels: [{ id: 'metro', name: '地铁旁', price: 268, tag: '出行方便' }],
  transport: [{ id: 'rail', name: '高铁往返', cost: 160 }],
};

function trip(overrides = {}) {
  return {
    ...fresh(), started: true, days: 3, people: 2, rooms: 1,
    plans: [[], [], []], ...overrides,
  };
}

describe('budgetOf', () => {
  it('没有交通住宿时只算餐饮预留', () => {
    const result = budgetOf(trip(), demo);
    expect(result.daily).toBe(600);
    expect(result.total).toBe(600);
    expect(result.transportName).toBe('');
    expect(result.stayName).toBe('稍后再选');
  });

  it('交通按人数，住宿按房间夜', () => {
    const result = budgetOf(trip({ transport: 'rail', hotel: 'metro' }), demo);
    expect(result.rail).toBe(320);
    expect(result.stay).toBe(268 * 2 * 1);
    expect(result.total).toBe(320 + 536 + 600);
  });

  it('门票按人数累加，未知票价单独计数且不计零', () => {
    const result = budgetOf(trip({
      plans: [['paid', 'custom:1'], [], []],
      customPlaces: { 'custom:1': { id: 'custom:1', name: '真实地点', cost: null } },
    }), demo);
    expect(result.tickets).toBe(150);
    expect(result.missingTickets).toBe(1);
  });

  it('地图选的住宿优先显示名字，但不计价', () => {
    const result = budgetOf(trip({ mapStay: { name: '湖滨某处' } }), demo);
    expect(result.stayName).toBe('湖滨某处');
    expect(result.stay).toBe(0);
  });

  it('一天行程只算 0 晚住宿，不出现负数', () => {
    const result = budgetOf(trip({ days: 1, plans: [[]], hotel: 'metro' }), demo);
    expect(result.stay).toBe(0);
  });
});
```

- [x] **Step 3: 运行，确认失败**

Run: `npx vitest run src/domain/budget.spec.js`
Expected: FAIL，`Failed to resolve import "./budget.js"`

- [x] **Step 4: 写实现**

```js
// 旅迹风格预览/src/domain/budget.js
/* 旧版 budget() 的等价实现：先保证数字一致，口径问题留给报价层计划。 */

export function budgetOf(state, demo) {
  const transport = demo.transport.find((t) => t.id === state.transport) || null;
  const hotel = demo.hotels.find((h) => h.id === state.hotel) || null;
  const placeById = (id) => demo.places.find((p) => p.id === id) || state.customPlaces?.[id] || null;

  const people = state.people || 0;
  const days = state.days || 0;
  const rooms = state.rooms || 1;

  const rail = (transport?.cost || 0) * people;
  const stay = (hotel?.price || 0) * Math.max(0, days - 1) * rooms;

  let tickets = 0;
  let missingTickets = 0;
  for (const id of (state.plans || []).flat()) {
    const place = placeById(id);
    if (!place) continue;
    if (place.cost === null || place.cost === undefined) { missingTickets += 1; continue; }
    tickets += place.cost * people;
  }

  const daily = days * people * 100;

  return {
    rail,
    stay,
    tickets,
    daily,
    missingTickets,
    total: rail + stay + tickets + daily,
    transportName: transport?.name || '',
    stayName: state.mapStay?.name || hotel?.tag || '稍后再选',
  };
}
```

- [x] **Step 5: 运行，确认通过**

Run: `npx vitest run src/domain/budget.spec.js`
Expected: `Tests 5 passed (5)`

- [x] **Step 6: 提交**

```bash
git add 旅迹风格预览/src/domain/budget.js 旅迹风格预览/src/domain/budget.spec.js 旅迹风格预览/src/data/demo.js
git commit -m "feat(domain): 预算计算与演示数据 ESM 化"
```

---

## Task 6: Pinia 状态仓库

**Files:**
- Create: `旅迹风格预览/src/stores/trip.js`
- Create: `旅迹风格预览/src/stores/trip.spec.js`

- [x] **Step 1: 写失败的测试**

```js
// 旅迹风格预览/src/stores/trip.spec.js
import { beforeEach, describe, it, expect } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useTripStore } from './trip.js';
import { STORAGE_KEY } from '../domain/state.js';

const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};

const baseForm = {
  mode: 'new', origin: '上海', destination: '杭州', start: '2026-11-14',
  days: 2, people: 2, budget: 3000, title: '', notes: '',
  existing: { outbound: '', returnTrip: '', hotel: '', schedule: '' },
};

beforeEach(() => {
  memory.clear();
  setActivePinia(createPinia());
});

describe('trip store', () => {
  it('新建行程：写入天数分组、默认打开地图、进入交通页', () => {
    const trip = useTripStore();
    trip.createTrip(baseForm);
    expect(trip.started).toBe(true);
    expect(trip.days).toBe(2);
    expect(trip.plans).toEqual([[], []]);
    expect(trip.mapOpen).toBe(true);
    expect(trip.section).toBe('traffic');
  });

  it('已有行程：进入概览并把分项写成原文', () => {
    const trip = useTripStore();
    trip.createTrip({
      ...baseForm,
      mode: 'existing',
      existing: { outbound: 'G123 上海虹桥 → 杭州东', returnTrip: '', hotel: '东城某酒店', schedule: '第 2 天上午预约博物馆' },
    });
    expect(trip.section).toBe('overview');
    expect(trip.original).toContain('去程交通：G123 上海虹桥 → 杭州东');
    expect(trip.original).toContain('已订住宿：东城某酒店');
    expect(trip.original).not.toContain('返程交通');
  });

  it('天数被夹在 1–7', () => {
    const trip = useTripStore();
    trip.createTrip({ ...baseForm, days: 99 });
    expect(trip.days).toBe(7);
    expect(trip.plans).toHaveLength(7);
  });

  it('非法板块与越界天号被忽略', () => {
    const trip = useTripStore();
    trip.createTrip(baseForm);
    trip.setSection('nope');
    expect(trip.section).toBe('traffic');
    trip.setDay(5);
    expect(trip.day).toBe(0);
    trip.setDay(1);
    expect(trip.day).toBe(1);
  });

  it('每次操作都写回同一个 localStorage 键', () => {
    const trip = useTripStore();
    trip.createTrip(baseForm);
    expect(JSON.parse(memory.get(STORAGE_KEY)).destination).toBe('杭州');
    trip.setSection('days');
    expect(JSON.parse(memory.get(STORAGE_KEY)).section).toBe('days');
  });
});
```

- [x] **Step 2: 运行，确认失败**

Run: `npx vitest run src/stores/trip.spec.js`
Expected: FAIL，`Failed to resolve import "./trip.js"`

- [x] **Step 3: 写实现**

```js
// 旅迹风格预览/src/stores/trip.js
import { defineStore } from 'pinia';
import { fresh, load, save, SECTIONS } from '../domain/state.js';

function originalLines(existing) {
  return [
    ['去程交通', existing.outbound],
    ['返程交通', existing.returnTrip],
    ['已订住宿', existing.hotel],
    ['景点或预约', existing.schedule],
  ]
    .filter(([, value]) => String(value || '').trim())
    .map(([label, value]) => label + '：' + String(value).trim())
    .join('\n');
}

export const useTripStore = defineStore('trip', {
  state: () => load(),
  getters: {
    currentPoints: (s) => s.plans[s.day] || [],
    sectionLabel: (s) => SECTIONS.find((x) => x.id === s.section)?.label || '旅程概览',
  },
  actions: {
    persist() {
      return save(this.$state);
    },
    createTrip(form) {
      const days = Math.min(7, Math.max(1, Number(form.days) || 1));
      const existing = form.existing || {};
      const isExisting = form.mode === 'existing';
      Object.assign(this, fresh(), {
        started: true,
        entryMode: form.mode,
        mapOpen: true,
        origin: String(form.origin || '').trim(),
        destination: String(form.destination || '').trim(),
        start: String(form.start || ''),
        days,
        people: Math.max(1, Number(form.people) || 1),
        rooms: 1,
        budget: Math.max(0, Number(form.budget) || 0),
        tripName: String(form.title || '').trim(),
        notes: String(form.notes || '').trim(),
        original: isExisting ? originalLines(existing) : '',
        existingDetails: isExisting ? { ...existing } : null,
        section: isExisting ? 'overview' : 'traffic',
        plans: Array.from({ length: days }, () => []),
      });
      this.persist();
    },
    setSection(id) {
      if (!SECTIONS.some((s) => s.id === id)) return;
      this.section = id;
      this.persist();
    },
    setDay(value) {
      const day = Number(value);
      if (!Number.isInteger(day) || day < 0 || day >= this.days) return;
      this.day = day;
      this.persist();
    },
    toggleMap() {
      this.mapOpen = !this.mapOpen;
      this.persist();
    },
  },
});
```

- [x] **Step 4: 运行，确认通过**

Run: `npx vitest run src/stores/trip.spec.js`
Expected: `Tests 5 passed (5)`

- [x] **Step 5: 提交**

```bash
git add 旅迹风格预览/src/stores/trip.js 旅迹风格预览/src/stores/trip.spec.js
git commit -m "feat(store): Pinia 行程仓库，读写旧版同键"
```

---

## Task 7: 界面骨架（入口页 + 工作台外壳）

**Files:**
- Create: `旅迹风格预览/next.html`
- Create: `旅迹风格预览/src/main.js`
- Create: `旅迹风格预览/src/App.vue`
- Create: `旅迹风格预览/src/styles/index.css`
- Create: `旅迹风格预览/src/components/EntryScreen.vue`
- Create: `旅迹风格预览/src/components/Workspace.vue`
- Create: `旅迹风格预览/src/components/BudgetSummary.vue`
- Create: `旅迹风格预览/src/components/panels/OverviewPanel.vue`
- Create: `旅迹风格预览/src/components/panels/OriginalPanel.vue`
- Create: `旅迹风格预览/src/components/panels/PanelPlaceholder.vue`

- [x] **Step 1: 写 Vite 入口**

`旅迹风格预览/next.html`：

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>行间 · 旅行工作台（新架构）</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [x] **Step 2: 写样式入口**

`旅迹风格预览/src/styles/index.css`：

```css
@import '../../styles.css';
@import '../../lvji.css';
@import '../../workspace.css';
@import '../../live-data.css';

#map-placeholder {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 24px;
  color: var(--muted, #7b837c);
  line-height: 1.7;
}
```

- [x] **Step 3: 写应用入口**

`旅迹风格预览/src/main.js`：

```js
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './styles/index.css';
import { useTripStore } from './stores/trip.js';

const app = createApp(App);
app.use(createPinia());
app.mount('#app');

const trip = useTripStore();
trip.$subscribe(() => { trip.persist(); }, { detached: true, flush: 'post' });
```

- [x] **Step 4: 写根组件**

`旅迹风格预览/src/App.vue`：

```vue
<script setup>
import { computed, watchEffect } from 'vue';
import EntryScreen from './components/EntryScreen.vue';
import Workspace from './components/Workspace.vue';
import { useTripStore } from './stores/trip.js';

const trip = useTripStore();
const started = computed(() => trip.started);

watchEffect(() => {
  document.body.classList.toggle('entry-mode', !trip.started);
  document.body.classList.toggle('studio-mode', trip.started);
});
</script>

<template>
  <EntryScreen v-if="!started" />
  <Workspace v-else />
</template>
```

- [x] **Step 5: 写入口页**

`旅迹风格预览/src/components/EntryScreen.vue`：

```vue
<script setup>
import { reactive, ref } from 'vue';
import { useTripStore } from '../stores/trip.js';

const trip = useTripStore();
const mode = ref(null);
const error = ref('');
const form = reactive({
  origin: '上海', destination: '杭州', start: '2026-11-14', days: 3, people: 2, budget: 3000,
  title: '', notes: '', outbound: '', returnTrip: '', hotel: '', schedule: '',
});

function submit() {
  error.value = '';
  if (!form.origin.trim() || !form.destination.trim()) { error.value = '请填写出发地和目的地'; return; }
  if (mode.value === 'existing' && ![form.outbound, form.returnTrip, form.hotel, form.schedule].some((v) => String(v).trim())) {
    error.value = '请至少填写一项已确定的安排';
    return;
  }
  trip.createTrip({
    mode: mode.value,
    origin: form.origin, destination: form.destination, start: form.start,
    days: form.days, people: form.people, budget: form.budget,
    title: form.title, notes: form.notes,
    existing: { outbound: form.outbound, returnTrip: form.returnTrip, hotel: form.hotel, schedule: form.schedule },
  });
}
</script>

<template>
  <section class="lvji-create">
    <div class="lvji-copy">
      <span class="kicker">NEW JOURNEY / 新建旅行</span>
      <h1>让出发的想法，<br><em>变成一段旅程。</em></h1>
      <p>先确定目的地，再安排交通、住宿与每天的行程。</p>
    </div>

    <div class="lvji-create-card">
      <div class="create-card-head">
        <span class="kicker">LET'S START</span>
        <span class="demo-badge">新架构 · 试运行</span>
      </div>
      <h2>你已经有行程了吗？</h2>

      <div class="journey-mode" role="group" aria-label="已有行程情况">
        <button type="button" :class="{ active: mode === 'new' }" data-mode="new" @click="mode = 'new'">
          <strong>还没有行程</strong><small>从目的地与交通开始</small>
        </button>
        <button type="button" :class="{ active: mode === 'existing' }" data-mode="existing" @click="mode = 'existing'">
          <strong>已经有安排</strong><small>填写已确定的安排</small>
        </button>
      </div>

      <form v-if="mode" id="setup-form" @submit.prevent="submit">
        <div v-if="mode === 'existing'" class="existing-group full">
          <strong>已确定的安排</strong>
          <p>填你已经确定的内容，暂时没有的可以留空。</p>
          <label class="field">去程交通<input v-model="form.outbound" maxlength="500" placeholder="例如：高铁 G123，上海虹桥 → 杭州东"></label>
          <label class="field">返程交通<input v-model="form.returnTrip" maxlength="500" placeholder="例如：高铁 G456，杭州东 → 上海虹桥"></label>
          <label class="field">住宿地点<input v-model="form.hotel" maxlength="500" placeholder="输入或粘贴酒店名称、准确地址"></label>
          <label class="field">已确定的景点或预约<textarea v-model="form.schedule" maxlength="8000" placeholder="例如：第 2 天上午 10:00 预约灵隐寺"></textarea></label>
        </div>

        <div class="form-grid">
          <label class="field">出发地<input v-model="form.origin" name="origin" maxlength="60" required></label>
          <label class="field">目的地<input v-model="form.destination" name="destination" maxlength="60" required></label>
          <label class="field full">行程名称 <span class="optional">可选</span><input v-model="form.title" name="title" maxlength="80" placeholder="例如：沿湖慢慢走"></label>
        </div>

        <div class="form-grid">
          <label class="field">出发日期<input v-model="form.start" name="start" type="date" max="2030-12-31"></label>
          <label class="field">想玩几天
            <select v-model.number="form.days" name="days">
              <option v-for="n in 7" :key="n" :value="n">{{ n }} 天</option>
            </select>
          </label>
          <label class="field">整趟预算 <span class="optional">所有人 / 元</span>
            <input v-model.number="form.budget" name="budget" type="number" min="0" max="1000000">
          </label>
          <label class="field">出行人数
            <input v-model.number="form.people" name="people" type="number" min="1" max="20">
          </label>
        </div>

        <label class="field notes-label">偏好与备注
          <textarea v-model="form.notes" maxlength="3000" placeholder="比如：学生穷游、住宿靠近地铁、喜欢博物馆、不想太赶……"></textarea>
        </label>

        <p v-if="error" class="live-error">{{ error }}</p>
        <button class="create-submit" type="submit">
          {{ mode === 'existing' ? '保留安排，创建旅行工作台' : '创建旅行工作台' }} <span>→</span>
        </button>
      </form>

      <div v-else class="choose-start">
        <span>↖</span>
        <p>先告诉我们有没有行程，<br>再补充需要的信息。</p>
      </div>
    </div>
  </section>
</template>
```

- [x] **Step 6: 写预算摘要组件**

`旅迹风格预览/src/components/BudgetSummary.vue`：

```vue
<script setup>
import { computed } from 'vue';
import { useTripStore } from '../stores/trip.js';
import { budgetOf } from '../domain/budget.js';
import { toMinor, formatYuan } from '../domain/money.js';
import { DEMO } from '../data/demo.js';

const trip = useTripStore();
const result = computed(() => budgetOf(trip.$state, DEMO));
</script>

<template>
  <section class="compact-summary" aria-label="旅行费用摘要">
    <div><small>当前估算 <span>示例</span></small><strong>{{ formatYuan(toMinor(result.total)) }}</strong></div>
    <div><small>整趟预算</small><b>{{ formatYuan(toMinor(trip.budget)) }}</b></div>
    <div><small>{{ result.transportName ? '往返交通' : '交通待定' }}</small><b>{{ result.transportName || '尚未计入' }}</b></div>
    <div><small>住宿</small><b>{{ result.stayName }}</b></div>
  </section>
</template>
```

- [x] **Step 7: 写三个面板**

`旅迹风格预览/src/components/panels/OverviewPanel.vue`：

```vue
<script setup>
import { computed } from 'vue';
import { useTripStore } from '../../stores/trip.js';
import { budgetOf } from '../../domain/budget.js';
import { DEMO } from '../../data/demo.js';

const trip = useTripStore();
const result = computed(() => budgetOf(trip.$state, DEMO));
const counts = computed(() => ({
  days: trip.plans.length,
  places: trip.plans.flat().length,
  pool: trip.savedPlaces.length,
}));
</script>

<template>
  <div class="surface">
    <p class="eyebrow">01 / 旅程概览</p>
    <h2>{{ trip.destination }}，按你的节奏来。</h2>
    <p class="subtle">{{ trip.origin }}出发 · {{ trip.days }} 天 · {{ trip.people }} 人 · 预算 {{ trip.budget }} 元</p>
    <div class="budget-details">
      <div><span>已安排天数</span><span>{{ counts.days }}</span></div>
      <div><span>已安排地点</span><span>{{ counts.places }}</span></div>
      <div><span>待规划地点</span><span>{{ counts.pool }}</span></div>
      <div><span>当前估算</span><span>{{ result.total }} 元{{ result.missingTickets ? '（含 ' + result.missingTickets + ' 个未知门票）' : '' }}</span></div>
    </div>
    <p v-if="trip.notes" class="subtle">备注：{{ trip.notes }}</p>
    <p class="subtle">这一版先把概览与费用摘要迁过来；交通、住宿、地点、每日安排仍在旧版，迁完后统一切换。</p>
  </div>
</template>
```

`旅迹风格预览/src/components/panels/OriginalPanel.vue`：

```vue
<script setup>
import { computed } from 'vue';
import { useTripStore } from '../../stores/trip.js';

const trip = useTripStore();
const details = computed(() => trip.existingDetails || null);
const rows = computed(() => {
  const d = details.value;
  if (!d) return [];
  return [
    ['去程交通', d.outbound],
    ['返程交通', d.returnTrip],
    ['住宿', d.hotel],
    ['景点或预约', d.schedule],
  ].filter(([, v]) => String(v || '').trim());
});
</script>

<template>
  <div class="surface">
    <p class="eyebrow">06 / 我的需求</p>
    <h2>你已经确定的安排</h2>
    <div v-if="rows.length" class="budget-details">
      <div v-for="[label, value] in rows" :key="label"><span>{{ label }}</span><span>{{ value }}</span></div>
    </div>
    <pre v-if="trip.original" class="original-text">{{ trip.original }}</pre>
    <p v-else class="subtle">这份行程没有单独保存原文。</p>
    <p class="subtle">原文在迁移中只读保留，不会因为切换板块被改写。</p>
  </div>
</template>
```

`旅迹风格预览/src/components/panels/PanelPlaceholder.vue`：

```vue
<script setup>
import { computed } from 'vue';
import { useTripStore } from '../../stores/trip.js';

const trip = useTripStore();
const label = computed(() => trip.sectionLabel);
</script>

<template>
  <div class="surface">
    <p class="eyebrow">迁移中</p>
    <h2>{{ label }}还没有搬到新架构</h2>
    <p class="subtle">这一块涉及真实接口与地图，会在地图端口和交通住宿两个阶段迁过来，避免一次改太多。</p>
    <p class="subtle">现在需要用它，请回旧版；两边共用同一份本地行程，改动会同步。</p>
    <a class="button outline" href="/">回旧版继续</a>
  </div>
</template>
```

- [x] **Step 8: 写外壳组件**

`旅迹风格预览/src/components/Workspace.vue`：

```vue
<script setup>
import { computed } from 'vue';
import { useTripStore } from '../stores/trip.js';
import { SECTIONS } from '../domain/state.js';
import BudgetSummary from './BudgetSummary.vue';
import OverviewPanel from './panels/OverviewPanel.vue';
import OriginalPanel from './panels/OriginalPanel.vue';
import PanelPlaceholder from './panels/PanelPlaceholder.vue';

const trip = useTripStore();
const PANELS = { overview: OverviewPanel, original: OriginalPanel };
const panel = computed(() => PANELS[trip.section] || null);
const title = computed(() => trip.tripName || `${trip.destination}之旅`);
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="breadcrumb">我的旅行 <span>/</span> <strong>规划工作台</strong></div>
      <div class="top-actions">
        <span class="demo-badge">新架构 · 试运行</span>
        <span id="save-state">本地保存</span>
        <button class="button outline" id="map-toggle" :aria-expanded="String(trip.mapOpen)" @click="trip.toggleMap()">
          {{ trip.mapOpen ? '收起地图 ↙' : '展开地图 ↗' }}
        </button>
      </div>
    </header>

    <main id="main">
      <div id="desk">
        <div class="workspace" id="workspace" :class="{ 'with-map': trip.mapOpen }">
          <div class="planning">
            <div class="page-heading">
              <div>
                <p class="eyebrow">TRAVEL STUDIO / 旅行工作台</p>
                <h1 id="trip-title">{{ title }}</h1>
                <p id="trip-meta">{{ trip.origin }}出发 · {{ trip.days }}天 / {{ trip.people }}人</p>
              </div>
            </div>

            <BudgetSummary />

            <nav id="navigation" aria-label="规划模块">
              <button
                v-for="s in SECTIONS"
                :key="s.id"
                class="nav-item"
                :class="{ active: trip.section === s.id }"
                :data-section="s.id"
                @click="trip.setSection(s.id)"
              >
                <span>{{ s.icon }}</span>{{ s.label }}
              </button>
            </nav>

            <section id="panel">
              <component :is="panel" v-if="panel" />
              <PanelPlaceholder v-else />
            </section>
          </div>

          <div class="studio-dock" v-show="trip.mapOpen">
            <aside class="map-panel" id="map-panel">
              <div class="map-heading">
                <div><strong>在地图上看看</strong><small>地图端口将在下一阶段接入</small></div>
              </div>
              <div id="map-placeholder">
                <p>这一版先把工作台骨架和费用摘要搬过来。地点搜索、收藏、每日路线和真实车票仍在旧版。</p>
                <a class="button outline small" href="/">回旧版看地图</a>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
```

- [x] **Step 9: 构建，确认能出产物**

Run: `cd 'E:\旅游规划工作台制作\旅迹风格预览'; npm run build`
Expected: `✓ built in ...`，生成 `next/index.html` 与 `next/assets/`

Run: `Test-Path 'E:\旅游规划工作台制作\旅迹风格预览\next\index.html'`
Expected: `True`

- [x] **Step 10: 提交**

```bash
git add 旅迹风格预览/next.html 旅迹风格预览/src
git commit -m "feat(ui): Vue 入口页与工作台外壳"
```

---

## Task 8: 目录回退与 `/next/` 验收

**Files:**
- Modify: `旅迹风格预览/server.cjs:2`
- Create: `验证工具/check-next-shell.cjs`

- [x] **Step 1: 让本地服务支持目录**

`旅迹风格预览/server.cjs` 第 2 行里，在 `relative=decodeURIComponent(url.pathname);` 之后补一句：

```js
if(relative.endsWith('/'))relative+='index.html';
```

改完后这段应当是：

```js
const server=http.createServer((req,res)=>{let url,relative;try{url=new URL(req.url,'http://localhost');relative=decodeURIComponent(url.pathname);if(relative.endsWith('/'))relative+='index.html';}catch{res.writeHead(400);return res.end('Bad request');}
```

注意：后面那句 `path.resolve(root,'.'+(relative==='/'?'/index.html':relative))` 保留不动，两处不冲突。

- [x] **Step 2: 重启服务并确认两条入口**

先关掉正在跑的 `node server.cjs`（那个终端窗口 `Ctrl+C`），再重新启动：

Run: `cd 'E:\旅游规划工作台制作\旅迹风格预览'; E:\node.exe server.cjs`

Run: `(Invoke-WebRequest -Uri 'http://127.0.0.1:18647/next/' -UseBasicParsing).StatusCode`
Expected: `200`

Run: `(Invoke-WebRequest -Uri 'http://127.0.0.1:18647/' -UseBasicParsing).StatusCode`
Expected: `200`（旧版没被影响）

- [x] **Step 3: 写 `/next/` 端到端脚本**

`验证工具/check-next-shell.cjs`：

```js
process.env.TEMP = 'E:/旅游规划工作台制作/验证工具/tmp';
process.env.TMP = process.env.TEMP;
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://127.0.0.1:18647/next/';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/rail/search', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"测试中暂停"}' }));

  try {
    await page.goto(BASE);
    await page.getByRole('button', { name: '还没有行程 从目的地与交通开始' }).click();
    await page.getByRole('button', { name: '创建旅行工作台', exact: false }).click();

    await page.waitForFunction(() => document.querySelector('#trip-title')?.textContent.includes('杭州'));
    assert.equal(await page.locator('#map-panel').isVisible(), true, '行程确定后地图区默认展开');
    assert.equal(await page.locator('.nav-item[data-section]').count(), 6);
    assert.match(await page.locator('.compact-summary').innerText(), /600/, '2 人 3 天的餐饮预留应是 600');

    await page.locator('.nav-item[data-section="days"]').click();
    assert.match(await page.locator('#panel').innerText(), /迁移中/);

    await page.reload();
    await page.waitForFunction(() => document.querySelector('#trip-title')?.textContent.includes('杭州'));
    assert.equal(await page.getByRole('button', { name: '还没有行程 从目的地与交通开始' }).count(), 0, '刷新后不应回到入口页');

    await page.locator('#map-toggle').click();
    assert.equal(await page.locator('#map-panel').isVisible(), false);
    await page.locator('#map-toggle').click();
    assert.equal(await page.locator('#map-panel').isVisible(), true);

    await page.screenshot({ path: 'E:/旅游规划工作台制作/旅迹风格预览/验收/next-shell.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS 新架构外壳：建行程、默认展开地图、导航、刷新保留、地图开关');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
```

- [x] **Step 4: 运行**

Run: `cd 'E:\旅游规划工作台制作'; E:\node.exe 验证工具/check-next-shell.cjs`
Expected: `PASS 新架构外壳：建行程、默认展开地图、导航、刷新保留、地图开关`

若报 `#map-panel` 不可见，检查 `v-show` 绑定的是 `trip.mapOpen` 且 `createTrip` 里设为 `true`。

- [x] **Step 5: 看截图，修明显错位**

打开 `旅迹风格预览/验收/next-shell.png`，按顺序检查，命中哪条改哪条：

1. **左栏不能滚动**：在 `src/styles/index.css` 末尾追加
   ```css
   body.studio-mode .planning { height: 100%; overflow-y: auto; }
   ```
2. **右栏塌陷或宽度为 0**：用 DevTools 看 `.workspace` 的 computed `grid-template-columns`。旧 CSS 用 `.with-map` 控制两栏比例，模板里已经绑了 `:class="{ 'with-map': trip.mapOpen }"`，若仍塌陷，检查该 class 是否真的出现在 DOM 上。
3. **表单字段挤成一行**：确认 `EntryScreen.vue` 中每组字段外层有 `.form-grid`，每个 `<label>` 带 `class="field"`。

改完重新 `npm run build`，刷新 `/next/` 再截图。不要追求与旧版像素一致，那属于后续阶段的视觉验收。

- [x] **Step 6: 提交**

```bash
git add 旅迹风格预览/server.cjs 验证工具/check-next-shell.cjs 旅迹风格预览/验收/next-shell.png
git commit -m "feat(server): 目录回退支持 /next/，补新外壳验收"
```

---

## Task 9: 全量回归与收尾

**Files:** 无新增

- [x] **Step 1: 旧单测**

Run: `cd 'E:\旅游规划工作台制作\旅迹风格预览'; npm test`
Expected: `pass 6`、`fail 0`（providers.test.cjs，未被新测试干扰）

- [x] **Step 2: 新单测**

Run: `npm run test:unit`
Expected: `Test Files 5 passed (5)`、`Tests 25 passed (25)`
（money 4 + quote 5 + state 6 + budget 5 + trip 5）

- [x] **Step 3: 旧版浏览器回归**

依次执行，每条必须 PASS：

```bash
E:\node.exe 验证工具/check-review-plan.cjs
E:\node.exe 验证工具/check-compact-scroll.cjs
E:\node.exe 验证工具/check-entry-map.cjs
E:\node.exe 验证工具/check-map-candidates.cjs
E:\node.exe 验证工具/check-map-route-control.cjs
E:\node.exe 验证工具/check-map-statistics.cjs
E:\node.exe 验证工具/check-map-controls.cjs
E:\node.exe 验证工具/check-map-stay.cjs
E:\node.exe 验证工具/check-daily-route.cjs
E:\node.exe 验证工具/check-arrival-station.cjs
E:\node.exe 验证工具/check-migrate-fields.cjs
E:\node.exe 验证工具/check-budget-region.cjs
```

（`check-two-column.cjs`、`check-workspace.cjs` 属于旧三栏，不作基线。）

- [x] **Step 4: 新版外壳验收**

Run: `E:\node.exe 验证工具/check-next-shell.cjs`
Expected: `PASS 新架构外壳…`

- [x] **Step 5: 确认构建产物没进仓库**

Run: `git status --short`
Expected: 不出现 `旅迹风格预览/next/` 下的任何文件

- [x] **Step 6: 收尾提交**

```bash
git add -A
git commit -m "chore: Vue 迁移第一阶段收尾（单测 25 + 新旧外壳验收）"
```

---

## 验收标准

1. `/next/` 能新建行程、显示标题/导航/费用摘要，刷新后状态保留。
2. `/` 旧版行为完全不变，12 个旧回归脚本全部通过。
3. `npm test` 6 条、`npm run test:unit` 25 条全部通过。
4. `state` 结构与旧版逐字段一致，`version` 仍为 1，旧存档双向可读。
5. 构建产物 `next/` 不进版本库，源码可重复构建。

## 风险与回退

| 风险 | 处理 |
|---|---|
| 旧 CSS 依赖旧 DOM 结构，新页面错位 | Task 8 的截图步骤专门处理三类硬伤；其余留到视觉验收阶段 |
| 两个前端同时写同一个 localStorage 键 | 只在各自页面运行；同一浏览器两个标签页同时改会互相覆盖，属已知限制，切默认前不解决 |
| `npm install` 拉包失败 | 仓库已配 npmmirror；失败时 `npm install --registry=https://registry.npmmirror.com` |
| Vite 8 与插件版本不兼容 | 本计划已核对 peer：plugin-vue 6.0.11 支持 vite ^8；vitest 5.1.0 支持 vite ^8 |
| 迁移半途而废 | `/next/` 是独立入口，删掉 `next/` 与 `src/` 即可回到单前端，旧版从未被改动 |

## 后续计划（本次不写）

| 计划 | 内容 |
|---|---|
| B《地图端口》 | `MapPort` 接口 + 高德/Leaflet 两实现；地点搜索、位置卡、收藏、候选星标进 Vue |
| C《每日与交通》 | 分日编辑、当天路线、12306 查询与换乘、到达站、住宿选点 |
| D《报价与切换》 | 用 `quote.js` 重写预算；切换 `/` 到新前端；删除旧前端脚本与包裹链 |
