import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repository = resolve(__dirname, '../../../..');
const read = (path: string) => readFileSync(resolve(repository, path), 'utf8');
const source = (name: string) =>
  Bun.YAML.parse(read(`.github/workflows/${name}`)) as {
    jobs: Record<string, { if: string; steps: Array<{ name?: string; run?: string }> }>;
  };
const completed = (override: Record<string, string> = {}) => ({
  event_name: 'workflow_run',
  ref: 'refs/heads/main',
  repository: 'OxyHQ/Schedio',
  event: {
    workflow_run: {
      conclusion: 'success',
      event: 'push',
      head_branch: 'main',
      head_repository: { full_name: 'OxyHQ/Schedio' },
      ...override,
    },
  },
});

// These workflow conditions use the shared JS/GitHub boolean subset only.
// Evaluate the real YAML expression so an accidentally unguarded OR branch fails.
for (const [file, job] of [
  ['deploy-aws.yml', 'gate'],
  ['deploy-cloudflare.yml', 'deploy-app'],
]) {
  describe(`prelaunch ${file}`, () => {
    const condition = source(file).jobs[job].if;
    const evaluate = new Function('vars', 'github', `return Boolean(${condition});`) as (
      vars: Record<string, string>,
      github: object,
    ) => boolean;
    test('unset/false blocks successful CI and manual dispatch', () => {
      for (const vars of [{}, { SCHEDIO_LAUNCH_ENABLED: 'false' }]) {
        expect(evaluate(vars, completed())).toBe(false);
        expect(evaluate(vars, { ...completed(), event_name: 'workflow_dispatch' })).toBe(false);
      }
    });
    test('launch still requires trusted successful main CI or main dispatch', () => {
      const vars = { SCHEDIO_LAUNCH_ENABLED: 'true' };
      expect(evaluate(vars, completed())).toBe(true);
      expect(evaluate(vars, { ...completed(), event_name: 'workflow_dispatch' })).toBe(true);
      expect(evaluate(vars, completed({ conclusion: 'failure' }))).toBe(false);
      expect(evaluate(vars, completed({ event: 'pull_request' }))).toBe(false);
      expect(evaluate(vars, completed({ head_branch: 'feature' }))).toBe(false);
      const foreign = completed();
      foreign.event.workflow_run.head_repository.full_name = 'Other/Schedio';
      expect(evaluate(vars, foreign)).toBe(false);
      expect(
        evaluate(vars, {
          ...completed(),
          event_name: 'workflow_dispatch',
          ref: 'refs/heads/feature',
        }),
      ).toBe(false);
    });
  });
}

test('prelaunch leaves public smoke, rollback and explicit DB-only maintenance available', () => {
  const aws = source('deploy-aws.yml').jobs.deploy.steps;
  expect(aws.find((step) => step.name === 'Smoke the public API')?.run).toContain(
    'https://api.schedio.app/api/health',
  );
  expect(aws.find((step) => step.name === 'Roll back a failed release')?.run).toContain(
    'aws ecs update-service',
  );
  expect(
    source('deploy-cloudflare.yml').jobs['deploy-app'].steps.find(
      (step) => step.name === 'Smoke the deployed app',
    )?.run,
  ).toContain('https://schedio.app/');
  expect(read('scripts/run-ecs-one-shot.sh')).not.toContain('SCHEDIO_LAUNCH_ENABLED');
});
