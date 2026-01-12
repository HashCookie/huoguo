import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import { QueueSnapshot } from '@/lib/types';

/**
 * 数据存储管理器
 * 负责将排队快照保存到本地 JSONL 文件
 */
export class DataStorage {
  private dataDir: string;

  constructor(dataDir: string = path.join(process.cwd(), 'data', 'snapshots')) {
    this.dataDir = dataDir;
    this.ensureDataDirExists();
  }

  /**
   * 确保数据目录存在
   */
  private ensureDataDirExists(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      console.log(`📁 创建数据目录: ${this.dataDir}`);
    }
  }

  /**
   * 获取当天的文件路径
   */
  private getTodayFilePath(): string {
    const today = dayjs().format('YYYY-MM-DD');
    return path.join(this.dataDir, `${today}.jsonl`);
  }

  /**
   * 保存快照到文件
   * @param snapshot 排队快照数据
   */
  async saveSnapshot(snapshot: QueueSnapshot): Promise<void> {
    const filePath = this.getTodayFilePath();
    const line = JSON.stringify(snapshot) + '\n';

    try {
      // 使用追加模式写入
      fs.appendFileSync(filePath, line, 'utf-8');
      console.log(`✅ 数据已保存: ${snapshot.timestamp}`);
    } catch (error) {
      console.error('❌ 保存数据失败:', error);
      throw error;
    }
  }

  /**
   * 读取指定日期的所有快照
   * @param date 日期字符串 (YYYY-MM-DD)
   */
  async readSnapshots(date: string): Promise<QueueSnapshot[]> {
    const filePath = path.join(this.dataDir, `${date}.jsonl`);

    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);

    return lines.map(line => JSON.parse(line) as QueueSnapshot);
  }

  /**
   * 获取所有数据文件列表
   */
  getAllDataFiles(): string[] {
    if (!fs.existsSync(this.dataDir)) {
      return [];
    }

    return fs
      .readdirSync(this.dataDir)
      .filter(file => file.endsWith('.jsonl'))
      .sort();
  }

  /**
   * 获取数据统计
   */
  getStats(): { totalFiles: number; totalSize: number; dateRange: { start: string; end: string } | null } {
    const files = this.getAllDataFiles();
    
    if (files.length === 0) {
      return { totalFiles: 0, totalSize: 0, dateRange: null };
    }

    let totalSize = 0;
    files.forEach(file => {
      const filePath = path.join(this.dataDir, file);
      totalSize += fs.statSync(filePath).size;
    });

    return {
      totalFiles: files.length,
      totalSize,
      dateRange: {
        start: files[0].replace('.jsonl', ''),
        end: files[files.length - 1].replace('.jsonl', ''),
      },
    };
  }
}
