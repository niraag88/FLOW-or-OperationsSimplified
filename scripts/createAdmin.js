#!/usr/bin/env node

// Use direct database connection since tsx is needed for TypeScript imports
import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcrypt';
import readline from 'readline';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function questionHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    let input = '';
    const onData = (ch) => {
      switch (ch) {
        case '\n':
        case '\r':
        case '\u0004': // Ctrl-D
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(input);
          break;
        case '\u0003': // Ctrl-C
          process.exit();
          break;
        case '\u007f': // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
          break;
        default:
          input += ch;
          process.stdout.write('*');
          break;
      }
    };
    
    process.stdin.on('data', onData);
  });
}

async function createAdmin() {
  try {
    console.log('🔐 Admin User Setup\n');

    const username = await question('Username: ');
    if (!username.trim()) {
      console.error('Username cannot be empty');
      process.exit(1);
    }

    // Check if username already exists
    const existingUserResult = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existingUserResult.rows.length > 0) {
      console.error(`User '${username}' already exists`);
      process.exit(1);
    }

    const password = await questionHidden('Password: ');
    if (!password.trim()) {
      console.error('Password cannot be empty');
      process.exit(1);
    }

    const confirmPassword = await questionHidden('Confirm Password: ');
    if (password !== confirmPassword) {
      console.error('Passwords do not match');
      process.exit(1);
    }

    const firstName = await question('First Name (optional): ');
    const lastName = await question('Last Name (optional): ');
    const email = await question('Email (optional): ');

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create admin user
    const result = await pool.query(`
      INSERT INTO users (username, password, role, first_name, last_name, email, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, username, role, first_name, last_name, email, active, created_at
    `, [
      username,
      hashedPassword,
      'Admin',
      firstName.trim() || null,
      lastName.trim() || null,
      email.trim() || null,
      true
    ]);
    
    const adminUser = result.rows[0];

    console.log('\n✅ Admin user created successfully!');
    console.log('User Details:');
    console.log(`  Username: ${adminUser.username}`);
    console.log(`  Role: ${adminUser.role}`);
    console.log(`  Name: ${adminUser.first_name || ''} ${adminUser.last_name || ''}`.trim() || 'Not provided');
    console.log(`  Email: ${adminUser.email || 'Not provided'}`);
    console.log(`  Active: ${adminUser.active}`);
    console.log(`  Created: ${adminUser.created_at}`);

    console.log('\nYou can now log in to the system with these credentials.');

  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  } finally {
    rl.close();
    await pool.end();
    process.exit(0);
  }
}

createAdmin();