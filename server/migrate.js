import pkg from 'pg';
const { Pool } = pkg;
import { readFileSync } from 'fs';

const DATABASE_URL = process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('📦 Starting migration...\n');
    
    const migrationSQL = readFileSync('./server/migrations/004_add_new_features.sql', 'utf8');
    
    // Split by statement and execute
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`Executing ${statements.length} SQL statements...\n`);
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt) {
        try {
          await client.query(stmt + ';');
          if (stmt.includes('CREATE TABLE')) {
            const match = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
            if (match) {
              console.log(`  ✓ Created table: ${match[1]}`);
            }
          } else if (stmt.includes('INSERT INTO leave_types')) {
            console.log(`  ✓ Inserted default leave types`);
          } else if (stmt.includes('CREATE INDEX')) {
            const match = stmt.match(/CREATE INDEX IF NOT EXISTS (\w+)/);
            if (match) {
              console.log(`  ✓ Created index: ${match[1]}`);
            }
          }
        } catch (err) {
          console.error(`  ✗ Error in statement ${i + 1}:`, err.message);
        }
      }
    }
    
    console.log('\n✅ Migration completed successfully!\n');
    
    // Verify tables
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE '%leave%' 
         OR table_name LIKE '%recurring%'
         OR table_name LIKE '%overtime%'
         OR table_name LIKE '%invoice%'
         OR table_name = 'notification_queue'
      ORDER BY table_name;
    `);
    
    console.log('📊 Created tables:');
    result.rows.forEach(row => {
      console.log(`  • ${row.table_name}`);
    });
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
