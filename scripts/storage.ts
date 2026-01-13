import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import axios from 'axios';
import { QueueSnapshot } from '@/lib/types';

/**
 * 数据存储管理器 - 本地文件
 */
export class DataStorage {
  private dataDir: string;

  constructor(dataDir: string = path.join(process.cwd(), 'data', 'snapshots')) {
    this.dataDir = dataDir;
    this.ensureDataDirExists();
  }

  private ensureDataDirExists(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      console.log(`📁 创建数据目录: ${this.dataDir}`);
    }
  }

  private getTodayFilePath(): string {
    const today = dayjs().format('YYYY-MM-DD');
    return path.join(this.dataDir, `${today}.jsonl`);
  }

  async saveSnapshot(snapshot: QueueSnapshot): Promise<void> {
    const filePath = this.getTodayFilePath();
    const line = JSON.stringify(snapshot) + '\n';

    try {
      fs.appendFileSync(filePath, line, 'utf-8');
      console.log(`✅ 本地数据已保存: ${snapshot.timestamp}`);
    } catch (error) {
      console.error('❌ 保存本地数据失败:', error);
      throw error;
    }
  }

  async readSnapshots(date: string): Promise<QueueSnapshot[]> {
    const filePath = path.join(this.dataDir, `${date}.jsonl`);
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);
    return lines.map(line => JSON.parse(line) as QueueSnapshot);
  }

  getAllDataFiles(): string[] {
    if (!fs.existsSync(this.dataDir)) return [];
    return fs.readdirSync(this.dataDir).filter(file => file.endsWith('.jsonl')).sort();
  }

  getStats(): { totalFiles: number; totalSize: number; dateRange: { start: string; end: string } | null } {
    const files = this.getAllDataFiles();
    if (files.length === 0) return { totalFiles: 0, totalSize: 0, dateRange: null };
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

/**
 * 数据存储管理器 - 远程数据库 (通过 API)
 */
export class RemoteStorage {
  private apiUrl: string;
  private apiSecret: string;

  constructor() {
    this.apiUrl = process.env.API_URL || 'http://localhost:3000/api/collect';
    this.apiSecret = process.env.API_SECRET || '';
  }

  async saveSnapshot(snapshot: QueueSnapshot): Promise<void> {
    if (!this.apiSecret) {
      console.warn('⚠️ 未配置 API_SECRET，跳过远程保存');
      return;
    }

    try {
      const response = await axios.post(this.apiUrl, snapshot, {
        headers: {
          'Authorization': `Bearer ${this.apiSecret}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.data.success) {
        console.log(`🌐 远程数据同步成功: ${snapshot.timestamp}`);
      } else {
        console.error('❌ 远程数据同步失败:', response.data.error);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('❌ 远程请求失败:', error.response?.data || error.message);
      } else {
        console.error('❌ 远程同步未知错误:', error);
      }
    }
  }
}
