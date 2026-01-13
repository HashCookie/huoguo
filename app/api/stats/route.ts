import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { snapshots } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import dayjs from 'dayjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    console.log('Fetching stats from database...');
    
    // 获取总记录数
    const statsResult = await db.select({
      totalCount: sql<number>`count(*)`,
      minDate: sql<string>`MIN(${snapshots.timestamp})`,
      maxDate: sql<string>`MAX(${snapshots.timestamp})`,
    }).from(snapshots);

    const { totalCount, minDate, maxDate } = statsResult[0] || { totalCount: 0, minDate: null, maxDate: null };
    console.log(`Stats: totalCount=${totalCount}, minDate=${minDate}, maxDate=${maxDate}`);

    // 获取所有有数据的日期
    const datesResult = await db.select({
      dateStr: sql<string>`TO_CHAR(${snapshots.timestamp}, 'YYYY-MM-DD')`
    })
    .from(snapshots)
    .groupBy(sql`TO_CHAR(${snapshots.timestamp}, 'YYYY-MM-DD')`)
    .orderBy(sql`1 ASC`);

    const availableDates = datesResult.map(r => r.dateStr);
    console.log('Available dates:', availableDates);

    return NextResponse.json({
      success: true,
      stats: {
        totalRecords: Number(totalCount),
        totalFiles: availableDates.length,
        totalSizeKB: "Database",
        dateRange: minDate ? {
          start: dayjs(minDate).format('YYYY-MM-DD'),
          end: dayjs(maxDate).format('YYYY-MM-DD'),
        } : null,
        availableDates,
      },
    });
  } catch (error) {
    console.error('API Error in /api/stats:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
