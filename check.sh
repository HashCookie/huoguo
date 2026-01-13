#!/usr/bin/env zsh

# 加载环境变量
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
else
  echo "❌ Error: .env.local file not found"
  exit 1
fi

echo "🔍 正在查询数据库记录..."

# 调用 API 获取统计数据 (最快且不依赖本地编译)
STATS=$(curl -s https://huoguo-ashen.vercel.app/api/stats)
COUNT=$(echo $STATS | sed -n 's/.*"totalRecords":\([^,}]*\).*/\1/p')
LATEST_DATES=$(echo $STATS | sed -n 's/.*"availableDates":\[\([^]]*\)\].*/\1/p')

if [ -z "$COUNT" ]; then
  # 如果 API 失败，尝试本地 tsx 执行 (作为备份)
  npx tsx db-check.ts
else
  echo "--------------------------------"
  echo "📊 数据库统计 (来自生产环境)"
  echo "✅ 总记录数: $COUNT 条"
  echo "📅 有效日期: $LATEST_DATES"
  echo "--------------------------------"
fi
