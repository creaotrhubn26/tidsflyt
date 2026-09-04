/**
 * server/lib/turnus-solver-client.ts
 *
 * Invokes the Python CP-SAT sidecar (turnus-solver/cli.py) as a child process:
 * writes a SolverRequest JSON to stdin, reads a SolverResponse JSON from stdout.
 *
 * Request data is passed only via stdin as JSON (never as shell args), so there
 * is no command-injection surface. The sidecar always emits a JSON envelope
 * (even on internal error), so a non-JSON stdout or a nonzero exit is treated
 * as an infrastructure failure and surfaced as status 'error'.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { CONTRACT_VERSION } from '@shared/turnus-solver-contract';
import type { SolverRequest, SolverResponse } from '@shared/turnus-solver-contract';

const SOLVER_DIR = process.env.TURNUS_SOLVER_DIR
  ?? path.resolve(process.cwd(), 'turnus-solver');
const PYTHON_BIN = process.env.TURNUS_SOLVER_PYTHON ?? 'python3';
const DEFAULT_TIMEOUT_MS = 60_000;

export interface RunSolverOptions {
  timeoutMs?: number;
}

export async function runSolver(
  request: SolverRequest,
  opts: RunSolverOptions = {},
): Promise<SolverResponse> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const payload = JSON.stringify({ ...request, contractVersion: CONTRACT_VERSION });

  return new Promise<SolverResponse>((resolve) => {
    const child = spawn(PYTHON_BIN, ['cli.py'], {
      cwd: SOLVER_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finishError = (msg: string): void => {
      if (settled) return;
      settled = true;
      resolve({
        contractVersion: CONTRACT_VERSION,
        status: 'error',
        vakter: [],
        bindende: [],
        uoppfylte: [],
        objektiv: {},
        solveTidMs: 0,
        solverVersjon: 'unavailable',
        feilmelding: msg,
      });
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finishError(`solver timed out after ${timeoutMs}ms`);
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      finishError(`could not start solver (${PYTHON_BIN}): ${err.message}`);
    });
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      if (code !== 0 && stdout.trim() === '') {
        finishError(`solver exited ${code}: ${stderr.slice(0, 500)}`);
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as SolverResponse;
        if (parsed.contractVersion !== CONTRACT_VERSION) {
          finishError(`solver contractVersion ${parsed.contractVersion} != ${CONTRACT_VERSION}`);
          return;
        }
        settled = true;
        resolve(parsed);
      } catch (e) {
        finishError(`unparseable solver output: ${(e as Error).message}; raw: ${stdout.slice(0, 300)}`);
      }
    });

    // Guard against EPIPE if the child dies before draining stdin (e.g. ENOENT):
    // an unhandled stream 'error' would otherwise throw and crash the process.
    child.stdin.on('error', () => { /* surfaced via child 'error'/'close' → error envelope */ });
    child.stdin.write(payload);
    child.stdin.end();
  });
}
