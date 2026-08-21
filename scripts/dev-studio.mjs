import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npmCommand, ['--prefix', 'frontend/studio', 'run', 'dev'], {
    stdio: 'inherit',
    shell: false,
  }),
  spawn('mvn', ['quarkus:dev'], {
    stdio: 'inherit',
    shell: false,
  }),
];

let shuttingDown = false;

function stopChildren(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 250);
}

for (const child of children) {
  child.on('error', (error) => {
    console.error(`Unable to start development process: ${error.message}`);
    stopChildren(1);
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const exitCode = typeof code === 'number' ? code : 1;
    console.error(`Development process stopped (${signal || exitCode}).`);
    stopChildren(exitCode);
  });
}

process.on('SIGINT', () => stopChildren(0));
process.on('SIGTERM', () => stopChildren(0));
