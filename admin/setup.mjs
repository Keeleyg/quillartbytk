/**
 * One-time credential setup for the local gallery admin tool.
 *
 *   npm run admin:setup
 *
 * Prompts for a username and password, then writes a salted SHA-256 hash to
 * admin/credentials.json (which is gitignored and never leaves your machine).
 * Re-run any time to change the login.
 */
import { createInterface } from 'node:readline';
import { randomBytes, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const credsPath = join(__dirname, 'credentials.json');

function ask(question, { hidden = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (hidden) {
      // Best-effort masking: mute the echoed characters.
      const onData = (char) => {
        const s = char.toString();
        if (s === '\n' || s === '\r' || s === '') {
          process.stdin.removeListener('data', onData);
        } else {
          process.stdout.write('\x1b[2K\x1b[200D' + question + '*'.repeat(rl.line.length));
        }
      };
      process.stdin.on('data', onData);
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

const username = await ask('Choose a username: ');
if (!username) {
  console.error('Username cannot be empty.');
  process.exit(1);
}

const password = await ask('Choose a password: ', { hidden: true });
if (password.length < 6) {
  console.error('Password must be at least 6 characters.');
  process.exit(1);
}

const confirm = await ask('Confirm password: ', { hidden: true });
if (password !== confirm) {
  console.error('Passwords do not match.');
  process.exit(1);
}

const salt = randomBytes(16).toString('hex');
const passwordHash = createHash('sha256').update(salt + password).digest('hex');

await writeFile(
  credsPath,
  JSON.stringify({ username, salt, passwordHash }, null, 2) + '\n',
  'utf8'
);

console.log(`\n✓ Credentials saved to admin/credentials.json (gitignored).`);
console.log(`  Start the editor with:  npm run admin`);
