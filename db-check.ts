import { db } from './lib/db';
import { snapshots } from './lib/db/schema';
import { count } from 'drizzle-orm';

async function checkDb() {
  try {
    const result = await db.select({ value: count() }).from(snapshots);
    console.log('Total snapshots in DB:', result[0].value);
    
    const latest = await db.query.snapshots.findFirst({
      orderBy: (items, { desc }) => [desc(items.timestamp)],
    });
    console.log('Latest snapshot timestamp:', latest?.timestamp);
  } catch (e) {
    console.error('DB Check failed:', e);
  }
}

checkDb();
