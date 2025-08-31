import bcrypt from 'bcryptjs';

const password = 'TestPassword123';
const saltRounds = 10;

async function generateHash() {
  const hash = await bcrypt.hash(password, saltRounds);
  console.log(`Password: ${password}`);
  console.log(`Hash: ${hash}`);
  
  // Verify it works
  const isValid = await bcrypt.compare(password, hash);
  console.log(`Verification: ${isValid ? 'SUCCESS' : 'FAILED'}`);
}

generateHash();