import { NextRequest, NextResponse } from 'next/server';
import { DataStorage } from '@/scripts/storage';
import dayjs from 'dayjs';

export const dynamic = 'force-dynamic';

/**
 * GET /api/queue-data?date=2026-01-12
 * 获取指定日期的排队数据
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date') || dayjs().format('YYYY-MM-DD');

    const storage = new DataStorage();
    const snapshots = await storage.readSnapshots(date);

    return NextResponse.json({
      success: true,
      date,
      count: snapshots.length,
      data: snapshots,
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
