# 微光集 (Lightlet) — 项目记忆

## 概述
- 为 INFP 设计的每日记录工具，参考 Focus Traveler 美术风格
- 核心理念：记录做过什么，而非追着做什么。用隐喻替代指令，用积累替代消除
- GitHub: https://github.com/elsewherrre/lightlet
- GitHub Pages: https://elsewherrre.github.io/lightlet/
- 美术概念设计文档: art-direction.html

## 技术栈
- 纯前端单文件 HTML（Phase 1）
- IndexedDB 存储 + localStorage 迁移
- Canvas 渲染星空
- 五层架构: View → State → Logic → Storage → Model

## 数据模型
```
Light {
  id: string (UUID)
  text: string
  createdAt: number        // 创建时间（判断过期的基准）
  completedAt: number | null
  date: string             // 当前归属日 YYYY-MM-DD（pending时每日更新）
  status: 'pending' | 'done' | 'expired'
}
Connection (Phase 2): { targetId, type: caused|accompanied, note? }
```

## 产品逻辑约定
- 未完成事项自动带入新一天（date 每日更新）
- 历史（过去某天）完全只读
- 过期时间默认 11 天，可在设置中自定义
- 过期 = pending 超过 11 天 → status 变 expired
- 遗忘之海 = 星夜模式查看 expired 事项（暗淡星空）
- 档案室 = 脉络模式查看 expired 事项（未完成关联网络）
- 遗忘和归档是同一数据的两种视图，不需要逐个选择
- 可归档（从今日移除但保留）/ 可删除（永久移除）

## 开发路线图
- Phase 1（当前）: 星夜模式深化 — 星空画布、日切换、时间记录、IndexedDB
- Phase 2: 脉络模式 + 关联网络
- Phase 3: PWA + 视觉深化 + 可选云端同步

## 双模式视觉
- 星夜模式: 深色背景 + 琥珀金光点（三层叠加发光）
- 脉络模式: 白底 + 黑色飘动圆点 + 连线
- 设计原则: 光 > 色 / 克制 > 丰富 / 时间感 / 手绘温暖 / 动效是呼吸
