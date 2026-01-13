import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { snapshots } from '@/lib/db/schema';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.API_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { timestamp, store_id, store_name, total_lineup, queue_details, raw_data } = body;

    if (!store_id || !store_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await db.insert(snapshots).values({
      timestamp: new Date(timestamp),
      storeId: store_id,
      storeName: store_name,
      totalLineup: total_lineup,
      queueDetails: queue_details,
      rawData: raw_data,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save snapshot:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
