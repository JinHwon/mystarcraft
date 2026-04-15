import { getDb } from './db';
import { sql } from 'drizzle-orm';

async function migrate() {
  try {
    console.log('Adding grade column to players table...');
    const db = await getDb();
    if (!db) {
      console.error('Database connection failed');
      process.exit(1);
    }
    await db.execute(
      sql`ALTER TABLE players ADD grade enum('S','A','B','C','D') DEFAULT 'D' NOT NULL`
    );
    console.log('✓ Migration completed successfully!');
  } catch (error: any) {
    if (error.message?.includes('Duplicate column')) {
      console.log('✓ Column already exists');
    } else {
      console.error('✗ Migration failed:', error.message);
    }
  }
  process.exit(0);
}

migrate();
