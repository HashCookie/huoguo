# 🍲 朱富贵火锅排队数据监控系统

自动采集厦门火车站禹悦汇店的实时排队数据，提供数据分析和预测功能。

## 📊 功能特性

- ✅ **自动数据采集**：每天晚上 17:00-22:00，每 10 秒采集一次排队数据
- ✅ **GitHub Actions 自动化**：云端运行，无需本地部署
- ✅ **数据持久化**：按日期保存 JSONL 格式数据
- ⏳ **数据分析**：基于历史数据预测等待时长（开发中）
- ⏳ **可视化仪表盘**：排队趋势图表和推荐建议（开发中）

## 🚀 快速开始

### 本地运行

```bash
# 安装依赖
pnpm install

# 启动数据采集（持续运行，Ctrl+C 停止）
pnpm run collect

# 查看今天的数据
pnpm run view-data

# 查看指定日期的数据
pnpm run view-data 2026-01-12
```

### GitHub Actions 自动采集

1. **推送代码到 GitHub**
   ```bash
   git add .
   git commit -m "🚀 初始化火锅排队数据采集系统"
   git push
   ```

2. **自动运行时间**
   - 每天北京时间 17:00 自动触发
   - 运行 5 小时（17:00-22:00）
   - 数据自动提交回仓库

3. **手动触发**（可选）
   - 进入 GitHub 仓库的 Actions 页面
   - 选择 "朱富贵排队数据采集" workflow
   - 点击 "Run workflow" 手动触发

## 📁 项目结构

```
huoguo/
├── .github/
│   └── workflows/
│       └── collect-data.yml    # GitHub Actions 配置
├── scripts/
│   ├── collector.ts            # 数据采集逻辑
│   ├── storage.ts              # 数据存储管理
│   ├── index.ts                # 采集服务入口
│   └── view-data.ts            # 数据查看工具
├── lib/
│   └── types.ts                # TypeScript 类型定义
├── data/
│   └── snapshots/              # 排队数据（JSONL 格式）
│       ├── 2026-01-12.jsonl
│       ├── 2026-01-13.jsonl
│       └── ...
├── app/                        # Next.js 前端（开发中）
└── package.json
```

## 📊 数据格式

每条记录包含以下信息：

```json
{
  "timestamp": "2026-01-12T13:05:26.061Z",
  "store_id": 19,
  "store_name": "朱富贵(火车站禹悦汇店)",
  "total_lineup": 7,
  "queue_details": {
    "type_a": 22,  // 1-2人桌排队数
    "type_b": 1,   // 3-4人桌排队数
    "type_c": 2,   // 5-6人桌排队数
    "type_f": 2,   // 7-8人桌排队数
    "type_t": 27   // 总计
  },
  "raw_data": { /* 原始 API 数据 */ }
}
```

## 🔧 开发计划

- [x] 阶段一：数据采集系统
  - [x] API 调用与数据提取
  - [x] 本地文件存储
  - [x] 数据查看工具
  - [x] GitHub Actions 自动化

- [ ] 阶段二：数据分析
  - [ ] 按星期统计平均等待时长
  - [ ] 按时间段统计
  - [ ] 按人数统计
  - [ ] 等待时长预测算法

- [ ] 阶段三：前端仪表盘
  - [ ] 实时排队数据展示
  - [ ] 历史趋势图表
  - [ ] 用户输入交互
  - [ ] 推荐时间段显示

## 📝 环境变量

- `MAX_RUNTIME_HOURS`: 最大运行时长（小时），默认 0（无限制）

## 📄 License

MIT
