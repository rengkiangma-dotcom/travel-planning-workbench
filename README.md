# 旅游规划工作台

本地运行的桌面优先旅游规划工作台。目标是把一次旅行从"想去哪"推进到"怎么去、住哪、每天做什么、一共多少钱"，并且不把估算、查询快照和真实成交混为一谈。

## 目录

| 路径 | 作用 |
| --- | --- |
| `旅迹风格预览/` | 主应用（旧版，原生 JS + 本地服务） |
| `旅迹风格预览/src/` | 新架构（Vue 3 + Vite + Pinia），构建产物在 `旅迹风格预览/next/` |
| `旅迹风格预览/server.cjs` | 本地静态服务与接口路由（默认 18647） |
| `旅迹风格预览/api.cjs` `providers.cjs` `hotel-provider.cjs` `backup.cjs` | 接口层：12306 / 高德 / 酒店 / 备份 |
| `验证工具/` | Playwright 无头验收脚本（不接管用户浏览器） |
| `docs/superpowers/` | 设计与实施计划 |
| `.agents/skills/` | 项目规则、架构导航和技能制作工具 |

本仓库是公开源码快照，不包含本地接口配置、旅行备份、采集的竞品资料、验收截图或旧原型。历史文档中的这些路径可能不可用；历史状态以实际代码为准。

## 启动

```
cd 旅迹风格预览
npm install
npm run build
node server.cjs
```

- 旧版工作台：<http://127.0.0.1:18647/>
- 新架构：<http://127.0.0.1:18647/next/>
- 12306 查询服务需要另行安装并启动兼容的本地 MCP 服务，监听 `127.0.0.1:18081`；旧的本地服务目录不包含在本仓库中，未配置时无法查询车次。

改了 `server.cjs`、`api.cjs`、`providers.cjs`、`backup.cjs` 之后必须重启服务；只改 `src/` 则需要 `npm run build`。

## 构建与测试

在 `旅迹风格预览/` 下：

```
npm run build      # 前端构建到 next/
npm test           # node:test，后端与接口单测
npm run test:unit  # vitest，领域与 store 单测
```

验收脚本在 `验证工具/`，用 `node 验证工具/<name>.cjs` 单独运行，例如：

```
node 验证工具/check-next-shell.cjs
node 验证工具/check-next-panels.cjs
node 验证工具/check-next-cheapest.cjs
```

`check-*-live.cjs` 会真的打 12306 / 高德，其余脚本优先用 mock 数据。

## 口径

- 未配置或查询失败一律显示"未知 / 暂无"，不按 0 计价。
- 12306 价格是查询快照，选中车次不等于购票。
- 高德人均消费不是可订房价；酒店报价需 RollingGo Key。
- 机票供应商尚未接入，界面里的机票卡片是示例。

更细的当前状态、已定决策和下一步见 `MEMORY.md`、`DECISIONS.md`、`TODO.md`。

## 项目技能

- `.agents/skills/travel-project-rules/`：价格、行程和验收等项目规则。
- `.agents/skills/travel-architecture/`：前后端、地图和数据流的架构导航。
- `.agents/skills/travel-skill-builder/`：将可复用流程整理成技能，并提供创建技能目录的脚手架。
- `.agents/skills/amap-interaction-workflow/`：高德地图界面与互动的需求、工具和验证方法。

是否自动发现项目技能取决于使用的智能体工具；也可以直接指定对应的 `SKILL.md`。在仓库根目录运行 `node .agents/skills/travel-skill-builder/scripts/create-skill.cjs my-skill "适用场景"` 可创建新技能，之后需要补全内容并验证。
