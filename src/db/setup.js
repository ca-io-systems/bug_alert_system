import 'dotenv/config';
import { initializeDatabase } from './database.js';

async function setupDatabase() {
  console.log('🔧 Setting up database schema...');
  console.log('ℹ️ Note: This script uses "CREATE TABLE IF NOT EXISTS", so it will NOT overwrite or delete your existing data.');

  const db = await initializeDatabase();

  try {
    // Create messages table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS discord_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE NOT NULL,
        channel_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        message_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ discord_messages table created');

    // Create alerts table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL,
        category TEXT NOT NULL,
        severity TEXT,
        summary TEXT NOT NULL,
        recommendation TEXT,
        timestamp DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES discord_messages(message_id)
      )
    `);
    console.log('✅ alerts table created');

    // Create indexes for performance
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_messages_channel ON discord_messages(channel_name)
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON discord_messages(timestamp DESC)
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_alerts_category ON alerts(category)
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC)
    `);

    console.log('✅ Indexes created');

    console.log('✅ Database setup completed successfully!');
    db.close?.();
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    db.close?.();
    process.exit(1);
  }
}

setupDatabase();
