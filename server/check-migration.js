import pkg from 'pg';
const { Pool } = pkg;

const DATABASE_URL = process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function checkTables() {
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN (
          'leave_types', 'leave_balances', 'leave_requests',
          'recurring_entries', 'overtime_settings', 'overtime_entries',
          'invoices', 'invoice_line_items', 'notification_queue'
        )
      ORDER BY table_name;
    `);
    
    console.log('🔍 Checking for new tables...\n');
    
    if (result.rows.length === 0) {
      console.log('❌ No new tables found. Running migration...\n');
      return false;
    }
    
    console.log('✅ Found tables:');
    result.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });
    
    console.log(`\n📊 Total: ${result.rows.length}/9 tables created`);
    
    if (result.rows.length === 9) {
      // Check leave types data
      const leaveTypes = await client.query('SELECT name FROM leave_types ORDER BY display_order');
      console.log('\n📋 Leave types:');
      leaveTypes.rows.forEach(row => {
        console.log(`  • ${row.name}`);
      });
    }
    
    return result.rows.length === 9;
    
  } catch (error) {
    console.error('❌ Error checking tables:', error.message);
    return false;
  } finally {
    client.release();
    await pool.end();
  }
}

checkTables().catch(console.error);
