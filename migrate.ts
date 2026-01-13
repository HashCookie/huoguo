import fs from 'fs';
import path from 'path';
import { db } from './lib/db';
import { snapshots } from './lib/db/schema';
import { QueueSnapshot } from './lib/types';

async function migrate() {
  const dataDir = path.join(process.cwd(), 'data', 'snapshots');
  if (!fs.existsSync(dataDir)) {
    console.log('No snapshots to migrate.');
    return;
  }

  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.jsonl'));
  console.log(`Found ${files.length} files to migrate.`);

  for (const file of files) {
    console.log(`Migrating ${file}...`);
    const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.length > 0);
    
    const batch = [];
    for (const line of lines) {
      try {
        const s = JSON.parse(line) as QueueSnapshot;
        batch.push({
          timestamp: new Date(s.timestamp),
          storeId: s.store_id,
          storeName: s.store_name,
          totalLineup: s.total_lineup,
          queueDetails: s.queue_details,
          rawData: s.raw_data,
        });

        // 每 100 条写一次
        if (batch.length >= 100) {
          await db.insert(snapshots).values(batch).onConflictDoNothing();
          batch.length = 0;
        }
      } catch (e) {
        console.error('Error parsing line:', e);
      }
    }

    if (batch.length > 0) {
      await db.insert(snapshots).values(batch).onConflictDoNothing();
    }
    console.log(`✅ Finished ${file}`);
  }
}

migrate().then(() => console.log('All done!')).catch(console.error);
