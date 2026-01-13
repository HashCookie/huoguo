import cron from 'node-cron';
import { DataCollector } from './collector';
import { DataStorage, RemoteStorage } from './storage';

/**
 * 朱富贵火锅排队数据采集服务
 * 每 10 秒自动抓取一次排队数据并保存到本地
 */

const collector = new DataCollector();
const localStorage = new DataStorage();
const remoteStorage = new RemoteStorage();

// 执行一次采集并保存
async function runCollectionTask() {
  try {
    const snapshot = await collector.collect();

    if (snapshot) {
      // 同时保存到本地和远程
      await Promise.allSettled([
        localStorage.saveSnapshot(snapshot),
        remoteStorage.saveSnapshot(snapshot)
      ]);
    } else {
      console.warn('⚠️ 本次采集未获取到有效数据');
    }
  } catch (error) {
    console.error('❌ 采集任务执行失败:', error);
  }
}

// 主函数
async function main() {
  // 从环境变量读取最大运行时长（小时），默认为 0（无限制）
  const maxRuntimeHours = parseFloat(process.env.MAX_RUNTIME_HOURS || '0');
  const startTime = Date.now();
  
  console.log('🚀 朱富贵火锅排队数据采集服务启动');
  console.log('📍 目标门店: 厦门火车站禹悦汇店 (ID=19)');
  console.log('⏱️  采集频率: 每 10 秒一次');
  if (maxRuntimeHours > 0) {
    console.log(`⏲️  最大运行时长: ${maxRuntimeHours} 小时`);
  }
  console.log('-----------------------------------\n');

  // 显示当前数据统计
  const stats = localStorage.getStats();
  if (stats.totalFiles > 0) {
    console.log(`📊 现有数据统计:`);
    console.log(`   - 文件数量: ${stats.totalFiles}`);
    console.log(`   - 总大小: ${(stats.totalSize / 1024).toFixed(2)} KB`);
    console.log(`   - 日期范围: ${stats.dateRange?.start} ~ ${stats.dateRange?.end}\n`);
  }

  // 立即执行一次
  await runCollectionTask();

  // 设置定时任务：每 10 秒执行一次
  const cronJob = cron.schedule('*/10 * * * * *', async () => {
    // 获取当前北京时间的小时数
    const beijingTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Shanghai"}));
    const currentHour = beijingTime.getHours();
    
    // 如果到了晚上 10 点 (22:00)，自动停止
    if (currentHour >= 22 || currentHour < 11) {
      console.log(`\n⏰ 到达北京时间 ${beijingTime.toLocaleTimeString()}，已超过营业采集时段 (11:00-22:00)，自动停止...`);
      cronJob.stop();
      await showFinalStats();
      process.exit(0);
    }

    // 检查是否超过最大运行时长
    if (maxRuntimeHours > 0) {
      const runningHours = (Date.now() - startTime) / (1000 * 60 * 60);
      if (runningHours >= maxRuntimeHours) {
        console.log(`\n⏱️  已运行 ${runningHours.toFixed(2)} 小时，达到最大时长，准备退出...`);
        cronJob.stop();
        await showFinalStats();
        process.exit(0);
      }
    }
    
    await runCollectionTask();
  });

  console.log('\n✅ 定时任务已启动，按 Ctrl+C 停止\n');
}

// 显示最终统计
async function showFinalStats() {
  console.log('\n📊 最终数据统计:');
  const stats = localStorage.getStats();
  console.log(`   - 文件数量: ${stats.totalFiles}`);
  console.log(`   - 总大小: ${(stats.totalSize / 1024).toFixed(2)} KB`);
  if (stats.dateRange) {
    console.log(`   - 日期范围: ${stats.dateRange.start} ~ ${stats.dateRange.end}`);
  }
  console.log('\n✅ 服务已停止');
}

// 优雅退出
process.on('SIGINT', async () => {
  console.log('\n\n👋 收到退出信号 (SIGINT)，正在停止采集服务...');
  await showFinalStats();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n👋 收到终止信号 (SIGTERM)，正在停止采集服务...');
  await showFinalStats();
  process.exit(0);
});

// 启动服务
main().catch(error => {
  console.error('❌ 服务启动失败:', error);
  process.exit(1);
});
