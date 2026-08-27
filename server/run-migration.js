import pkg from 'pg';
const { Pool } = pkg;
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === 'false' ||
    process.env.PGSSLMODE === 'disable' ||
    /localhost|127\.0\.0\.1/.test(DATABASE_URL)
      ? false
      : { rejectUnauthorized: true },
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('📦 Running migration: 004_add_new_features.sql');
    
    // Read the migration file
    const migrationSQL = readFileSync(
      join(__dirname, 'migrations', '004_add_new_features.sql'),
      'utf8'
    );
    
    // Execute the migration
    await client.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('Created tables:');
    console.log('  - leave_types (5 default types)');
    console.log('  - leave_balances');
    console.log('  - leave_requests');
    console.log('  - recurring_entries');
    console.log('  - overtime_settings');
    console.log('  - overtime_entries');
    console.log('  - invoices');
    console.log('  - invoice_line_items');
    console.log('  - notification_queue');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.position) {
      console.error('Error position:', error.position);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
