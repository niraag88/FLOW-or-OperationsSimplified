import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  const checkResult = await client.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'goods_receipts' 
    AND column_name IN ('reference_number', 'reference_date')
  `);
  const existing = checkResult.rows.map((r: any) => r.column_name);

  if (!existing.includes('reference_number')) {
    await client.query("ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS reference_number text");
    console.log('Added reference_number column');
  } else {
    console.log('reference_number already exists');
  }

  if (!existing.includes('reference_date')) {
    await client.query("ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS reference_date date");
    console.log('Added reference_date column');
  } else {
    console.log('reference_date already exists');
  }

  const verify = await client.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'goods_receipts' 
    ORDER BY ordinal_position
  `);
  console.log('Columns:', verify.rows.map((r: any) => r.column_name).join(', '));
} finally {
  client.release();
  await pool.end();
}
