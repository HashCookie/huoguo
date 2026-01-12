import { NextResponse } from 'next/server';
import { DataStorage } from '@/scripts/storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stats
 * 获取数据统计信息
 */
export async function GET() {
  try {
    const storage = new DataStorage();
    const stats = storage.getStats();
    const allFiles = storage.getAllDataFiles();

    return NextResponse.json({
      success: true,
      stats: {
        totalFiles: stats.totalFiles,
        totalSizeKB: (stats.totalSize / 1024).toFixed(2),
        dateRange: stats.dateRange,
        availableDates: allFiles.map(file => file.replace('.jsonl', '')),
      },
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
