import { pgTable, serial, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const snapshots = pgTable('snapshots', {
  id: serial('id').primaryKey(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  storeId: integer('store_id').notNull(),
  storeName: text('store_name').notNull(),
  totalLineup: integer('total_lineup').notNull(),
  queueDetails: jsonb('queue_details').notNull(),
  rawData: jsonb('raw_data'),
});

export type Snapshot = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;
