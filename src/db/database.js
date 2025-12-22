import { createClient } from '@libsql/client';

export async function initializeDatabase() {
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    // Test connection
    await db.execute('SELECT 1');

    return db;
}
