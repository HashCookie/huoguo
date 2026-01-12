import { DataStorage } from './storage';
import dayjs from 'dayjs';

/**
 * 数据查看工具
 * 用于查看和分析已采集的排队数据
 */

async function main() {
  const storage = new DataStorage();

  // 显示统计信息
  const stats = storage.getStats();
  console.log('📊 数据统计');
  console.log('─'.repeat(50));
  console.log(`文件数量: ${stats.totalFiles}`);
  console.log(`总大小: ${(stats.totalSize / 1024).toFixed(2)} KB`);
  if (stats.dateRange) {
    console.log(`日期范围: ${stats.dateRange.start} ~ ${stats.dateRange.end}`);
  }
  console.log('');

  // 获取命令行参数指定的日期，默认今天
  const targetDate = process.argv[2] || dayjs().format('YYYY-MM-DD');
  
  console.log(`📅 查看日期: ${targetDate}`);
  console.log('─'.repeat(50));

  const snapshots = await storage.readSnapshots(targetDate);

  if (snapshots.length === 0) {
    console.log(`⚠️ 未找到 ${targetDate} 的数据`);
    console.log('\n可用的数据文件:');
    storage.getAllDataFiles().forEach(file => {
      console.log(`  - ${file.replace('.jsonl', '')}`);
    });
    return;
  }

  console.log(`总记录数: ${snapshots.length} 条\n`);

  // 显示最近 10 条记录
  const recentCount = Math.min(10, snapshots.length);
  console.log(`🕐 最近 ${recentCount} 条记录:`);
  console.log('─'.repeat(100));
  console.log('时间'.padEnd(20) + '总排队'.padEnd(10) + '1-2人'.padEnd(10) + '3-4人'.padEnd(10) + '5-6人'.padEnd(10) + '7-8人');
  console.log('─'.repeat(100));

  snapshots.slice(-recentCount).forEach(snapshot => {
    const time = dayjs(snapshot.timestamp).format('HH:mm:ss');
    console.log(
      time.padEnd(20) +
      snapshot.total_lineup.toString().padEnd(10) +
      snapshot.queue_details.type_a.toString().padEnd(10) +
      snapshot.queue_details.type_b.toString().padEnd(10) +
      snapshot.queue_details.type_c.toString().padEnd(10) +
      snapshot.queue_details.type_f.toString()
    );
  });

  // 计算统计数据
  console.log('\n📈 统计分析');
  console.log('─'.repeat(50));

  const totalLineup = snapshots.map(s => s.total_lineup);
  const avgLineup = (totalLineup.reduce((a, b) => a + b, 0) / totalLineup.length).toFixed(1);
  const maxLineup = Math.max(...totalLineup);
  const minLineup = Math.min(...totalLineup);

  console.log(`平均排队人数: ${avgLineup}`);
  console.log(`最大排队人数: ${maxLineup}`);
  console.log(`最小排队人数: ${minLineup}`);

  // 各桌型平均排队
  const avgTypeA = (snapshots.reduce((sum, s) => sum + s.queue_details.type_a, 0) / snapshots.length).toFixed(1);
  const avgTypeB = (snapshots.reduce((sum, s) => sum + s.queue_details.type_b, 0) / snapshots.length).toFixed(1);
  const avgTypeC = (snapshots.reduce((sum, s) => sum + s.queue_details.type_c, 0) / snapshots.length).toFixed(1);
  const avgTypeF = (snapshots.reduce((sum, s) => sum + s.queue_details.type_f, 0) / snapshots.length).toFixed(1);

  console.log(`\n各桌型平均排队:`);
  console.log(`  1-2人: ${avgTypeA}`);
  console.log(`  3-4人: ${avgTypeB}`);
  console.log(`  5-6人: ${avgTypeC}`);
  console.log(`  7-8人: ${avgTypeF}`);
}

main().catch(console.error);
