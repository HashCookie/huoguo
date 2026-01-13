import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { snapshots } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import dayjs from 'dayjs';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stats
 * 获取数据统计信息
 */
export async function GET() {
  try {
    // 1. 获取所有有数据的日期 (去重)
    // 注意：如果是 postgres，可以使用 date_trunc 或强制转换
    const datesResult = await db.select({
      date: sql<string>`DISTINCT TO_CHAR(${snapshots.timestamp}, 'YYYY-MM-DD')`
    }).from(snapshots)
    .orderBy(sql`1 ASC`);

    const availableDates = datesResult.map(r => r.date);

    // 2. 获取总记录数和日期范围
    const statsResult = await db.select({
      totalCount: sql<number>`count(*)`,
      minDate: sql<string>`MIN(${snapshots.timestamp})`,
      maxDate: sql<string>`MAX(${snapshots.timestamp})`,
    }).from(snapshots);

    const { totalCount, minDate, maxDate } = statsResult[0] || { totalCount: 0, minDate: null, maxDate: null };

    return NextResponse.json({
      success: true,
      stats: {
        totalRecords: Number(totalCount),
        totalFiles: availableDates.length, // 兼容前端字段名
        totalSizeKB: "Database", // 数据库模式不再显示文件大小
        dateRange: minDate ? {
          start: dayjs(minDate).format('YYYY-MM-DD'),
          end: dayjs(maxDate).format('YYYY-MM-DD'),
        } : null,
        availableDates,
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
