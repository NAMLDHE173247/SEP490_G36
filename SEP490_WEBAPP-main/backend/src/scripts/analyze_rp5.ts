/**
 * Compatibility entry point for the RP5 Base-vs-Fine-tuned analysis.
 *
 * The statistical implementation lives in scripts/analyze_locked_runs.py so
 * the application, exported artifacts and offline analysis share one tested
 * definition of K, S, paired bootstrap and H1-H4.
 */
import path from 'path';
import { spawnSync } from 'child_process';

const repoRoot = path.resolve(__dirname, '../../..');
const python = process.env.RP5_PYTHON || 'python';
const cliArgs = process.argv.slice(2);
const isSelfTest = cliArgs.includes('--self-test');

const commandArgs = isSelfTest
  ? ['-m', 'unittest', 'test_locked_eval_protocol.py']
  : [path.join(repoRoot, 'scripts', 'analyze_locked_runs.py'), ...cliArgs];

if (!cliArgs.length) {
  process.stderr.write(
    'Usage: npm run analyze:rp5 -- --run <english.json> --run <math.json> ' +
    '--run <history.json> --output <analysis.json>\n',
  );
  process.exit(1);
}

const result = spawnSync(python, commandArgs, {
  cwd: isSelfTest ? path.join(repoRoot, 'gpu-service') : repoRoot,
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  process.stderr.write(`Could not start ${python}: ${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
