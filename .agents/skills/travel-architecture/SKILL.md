---
name: travel-architecture
description: 阅读、修改或解释旅游规划工作台的前后端架构、地图、数据流或模块边界时使用。
---

# 旅游规划工作台：架构导航

以当前代码为准，开始前查看根目录 `README.md`、项目决策和 Git 状态；状态文档可能落后于代码。不要根据旧文档断定某个功能已完成或仍是占位。

- `旅迹风格预览/src/` 是 Vue 3、Pinia 和 Vite 前端：`components/` 放界面，`stores/trip.js` 管理行程状态，`domain/` 放领域逻辑，`api/` 调用本地接口。
- `旅迹风格预览/server.cjs` 提供本地服务；`api.cjs`、`providers.cjs`、`hotel-provider.cjs`、`backup.cjs` 承担接口、供应商和备份等职责。核对实际调用关系后再修改。
- `旅迹风格预览/` 内的原生 JavaScript 和页面是旧界面，前端构建产物位于 `next/`；两套界面的行为与数据关系要针对具体变更核实。
- 地图相关实现从 `src/components/TravelMap.vue`、`amap-map.js` 和 `map-interactions.js` 入手，按实际引用追踪；第三方地图服务与坐标转换需单独核验。
- `验证工具/` 是验收脚本；实时脚本可能依赖外部服务。接口配置和旅行备份保存在本地，不应随代码分发。

改动前画清触发动作、状态变化、接口和持久化路径；优先复用现有边界。检查 `package.json` 中当前命令，按变更选择 `npm run build`、`npm test`、`npm run test:unit` 和相关交互验收。不要把构建成功当成真实接口或视觉验收通过。
