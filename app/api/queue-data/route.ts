import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { snapshots } from '@/lib/db/schema';
import { and, gte, lt, asc } from 'drizzle-orm';
import dayjs from 'dayjs';

export const dynamic = 'force-dynamic';

/**
 * GET /api/queue-data?date=2026-01-12
 * 获取指定日期的排队数据
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dateStr = searchParams.get('date') || dayjs().format('YYYY-MM-DD');
    
    // 计算当天的起止时间 (北京时间)
    const startDate = dayjs(dateStr).startOf('day').toDate();
    const endDate = dayjs(dateStr).endOf('day').toDate();

    const data = await db.query.snapshots.findMany({
      where: and(
        gte(snapshots.timestamp, startDate),
        lt(snapshots.timestamp, endDate)
      ),
      orderBy: [asc(snapshots.timestamp)],
    });

    // 转换为前端需要的格式 (适配之前的本地 snapshot 格式)
    const formattedData = data.map(item => ({
      timestamp: item.timestamp.toISOString(),
      store_id: item.storeId,
      store_name: item.storeName,
      total_lineup: item.totalLineup,
      queue_details: item.queueDetails,
      // raw_data 不再默认返回，节省流量
    }));

    return NextResponse.json({
      success: true,
      date: dateStr,
      count: formattedData.length,
      data: formattedData,
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
