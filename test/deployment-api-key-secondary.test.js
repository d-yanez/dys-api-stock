import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BASH = process.env.BASH || '/bin/bash';
const ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'gcp', 'configure-api-key-secrets.sh');
const CLOUDBUILD = path.join(ROOT, 'cloudbuild.yaml');
const ROTATION_DOC = path.join(ROOT, 'docs', 'api-key-rotation.md');

const PRIMARY_REF = 'api-key-current:latest';
const SECONDARY_REF = 'api-key-previous:latest';

function runCli(args, { env = process.env } = {}) {
  return spawnSync(BASH, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env
  });
}

function baseArgs(extra = []) {
  return [
    '--project',
    'prd-dyshopnow',
    '--region',
    'us-central1',
    '--service',
    'dys-api-stock',
    '--primary-secret-ref',
    PRIMARY_REF,
    ...extra
  ];
}

function createFakeGcloud() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dys-api-stock-gcloud-'));
  const recorder = path.join(dir, 'recorded-args.txt');
  const fake = path.join(dir, 'gcloud');
  writeFileSync(recorder, '');
  writeFileSync(
    fake,
    [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$*" >> "$RECORDER"',
      'if [[ "$1" == "run" && "$2" == "services" && "$3" == "update" ]]; then',
      '  printf "%s\\n" "PLAINTEXT_UNRELATED_VALUE_SENTINEL"',
      '  exit 0',
      'fi',
      'if [[ "$1" == "run" && "$2" == "services" && "$3" == "describe" ]]; then',
      '  printf "%s\\n" "dys-api-stock-00042-test"',
      '  exit 0',
      'fi',
      'exit 99',
      ''
    ].join('\n')
  );
  chmodSync(fake, 0o755);
  return { dir, recorder, fake };
}

test('script and deploy surfaces exist', () => {
  assert.doesNotThrow(() => readFileSync(SCRIPT, 'utf8'));
  assert.doesNotThrow(() => readFileSync(CLOUDBUILD, 'utf8'));
});

test('script passes a bash syntax check', () => {
  const result = spawnSync(BASH, ['-n', SCRIPT], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('dry run attaches primary and secondary secret references without values', () => {
  const result = runCli(
    baseArgs(['--secondary-secret-ref', SECONDARY_REF, '--rotation', '--dry-run'])
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /gcloud run services update dys-api-stock/);
  assert.match(result.stdout, /--project=prd-dyshopnow/);
  assert.match(result.stdout, /--region=us-central1/);
  assert.match(
    result.stdout,
    /--update-secrets=API_KEY=api-key-current:latest,API_KEY_SECONDARY=api-key-previous:latest/
  );
  assert.match(result.stdout, /--remove-env-vars=API_KEY,API_KEY_SECONDARY/);
  assert.doesNotMatch(result.stdout, /--set-secrets/);
  assert.doesNotMatch(result.stdout, /--set-env-vars/);
  assert.doesNotMatch(result.stdout, /--update-env-vars/);
  assert.doesNotMatch(result.stdout, /--env-vars-file/);
  assert.doesNotMatch(result.stdout, /--remove-secrets/);
});

test('rollback swaps the slots without reading values', () => {
  const result = runCli(
    baseArgs(['--secondary-secret-ref', SECONDARY_REF, '--rollback', '--dry-run'])
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /--update-secrets=API_KEY=api-key-previous:latest,API_KEY_SECONDARY=api-key-current:latest/
  );
});

test('retire-secondary removes the secondary reference and keeps the primary', () => {
  const result = runCli(baseArgs(['--retire-secondary', '--dry-run']));

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--update-secrets=API_KEY=api-key-current:latest(?: |$)/);
  assert.doesNotMatch(result.stdout, /API_KEY_SECONDARY=api-key/);
  assert.match(result.stdout, /--remove-secrets=API_KEY_SECONDARY/);
  assert.match(result.stdout, /--remove-env-vars=API_KEY,API_KEY_SECONDARY/);
});

test('fails closed when the primary secret reference is absent', () => {
  const result = runCli([
    '--project',
    'prd-dyshopnow',
    '--region',
    'us-central1',
    '--service',
    'dys-api-stock',
    '--rotation',
    '--secondary-secret-ref',
    SECONDARY_REF,
    '--dry-run'
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--primary-secret-ref/);
  assert.doesNotMatch(result.stdout, /gcloud run services update/);
});

test('fails closed when the rotation mode is absent', () => {
  const result = runCli(
    baseArgs(['--secondary-secret-ref', SECONDARY_REF, '--dry-run'])
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--rotation/);
  assert.doesNotMatch(result.stdout, /gcloud run services update/);
});

test('fails closed when rotation has no secondary reference', () => {
  const result = runCli(baseArgs(['--rotation', '--dry-run']));

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--secondary-secret-ref/);
  assert.doesNotMatch(result.stdout, /gcloud run services update/);
});

test('fails closed when retire-secondary receives a secondary reference', () => {
  const result = runCli(
    baseArgs(['--secondary-secret-ref', SECONDARY_REF, '--retire-secondary', '--dry-run'])
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--retire-secondary/);
  assert.doesNotMatch(result.stdout, /gcloud run services update/);
});

test('rejects value-looking secret references without echoing them', () => {
  const rejected = 'PlaintextSecretValue123';
  const result = runCli([
    '--project',
    'prd-dyshopnow',
    '--region',
    'us-central1',
    '--service',
    'dys-api-stock',
    '--primary-secret-ref',
    rejected,
    '--rotation',
    '--secondary-secret-ref',
    SECONDARY_REF,
    '--dry-run'
  ]);

  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, new RegExp(rejected));
  assert.doesNotMatch(result.stderr, new RegExp(rejected));
  assert.match(result.stderr, /--primary-secret-ref/);
});

test('rejects a secret reference without an explicit version', () => {
  const result = runCli([
    '--project',
    'prd-dyshopnow',
    '--region',
    'us-central1',
    '--service',
    'dys-api-stock',
    '--primary-secret-ref',
    'api-key-current',
    '--rotation',
    '--secondary-secret-ref',
    SECONDARY_REF,
    '--dry-run'
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--primary-secret-ref/);
});

test('invokes gcloud with additive secret flags and hides unrelated plain values', () => {
  const fake = createFakeGcloud();

  try {
    const env = {
      ...process.env,
      PATH: `${fake.dir}${path.delimiter}${process.env.PATH || ''}`,
      RECORDER: fake.recorder
    };
    const result = runCli(
      baseArgs(['--secondary-secret-ref', SECONDARY_REF, '--rotation']),
      { env }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /PLAINTEXT_UNRELATED_VALUE_SENTINEL/);
    assert.doesNotMatch(result.stderr, /PLAINTEXT_UNRELATED_VALUE_SENTINEL/);
    assert.match(result.stdout, /dys-api-stock-00042-test/);

    const recorded = readFileSync(fake.recorder, 'utf8').trim().split('\n');
    assert.equal(recorded.length, 2, recorded.join('\n'));
    assert.match(recorded[0], /^run services update dys-api-stock /);
    assert.match(
      recorded[0],
      /--update-secrets=API_KEY=api-key-current:latest,API_KEY_SECONDARY=api-key-previous:latest/
    );
    assert.match(recorded[0], /--remove-env-vars=API_KEY,API_KEY_SECONDARY/);
    assert.match(recorded[0], /--quiet/);
    assert.doesNotMatch(recorded[0], /--set-secrets/);
    assert.doesNotMatch(recorded[0], /--set-env-vars/);
    assert.doesNotMatch(recorded[0], /--update-env-vars/);
    assert.doesNotMatch(recorded[0], /--env-vars-file/);
    assert.doesNotMatch(recorded[0], /--clear-secrets/);
    assert.doesNotMatch(recorded[0], /--clear-env-vars/);
    assert.match(recorded[1], /^run services describe dys-api-stock /);
  } finally {
    rmSync(fake.dir, { recursive: true, force: true });
  }
});

test('image deploy keeps existing env and secret mappings', () => {
  const cloudbuild = readFileSync(CLOUDBUILD, 'utf8');

  assert.match(cloudbuild, /gcloud run deploy dys-api-stock/);
  assert.match(cloudbuild, /--image gcr\.io\/\$PROJECT_ID\/dys-api-stock:\$SHORT_SHA/);
  for (const forbidden of [
    '--set-env-vars',
    '--update-env-vars',
    '--remove-env-vars',
    '--clear-env-vars',
    '--env-vars-file',
    '--set-secrets',
    '--update-secrets',
    '--remove-secrets',
    '--clear-secrets',
    'API_KEY='
  ]) {
    assert.ok(!cloudbuild.includes(forbidden), `cloudbuild.yaml must not include ${forbidden}`);
  }
});

test('accepts a fully-qualified reference with a numeric project number', () => {
  const result = runCli([
    '--project',
    'prd-dyshopnow',
    '--region',
    'us-central1',
    '--service',
    'dys-api-stock',
    '--primary-secret-ref',
    'projects/123456789/secrets/api-key-current:latest',
    '--rotation',
    '--secondary-secret-ref',
    'projects/123456789/secrets/api-key-previous:3',
    '--dry-run'
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /--update-secrets=API_KEY=projects\/123456789\/secrets\/api-key-current:latest,API_KEY_SECONDARY=projects\/123456789\/secrets\/api-key-previous:3/
  );
});

test('rejects a fully-qualified reference that uses a project id instead of a number', () => {
  const projectIdRef = 'projects/prd-dyshopnow/secrets/api-key-current:latest';
  const result = runCli([
    '--project',
    'prd-dyshopnow',
    '--region',
    'us-central1',
    '--service',
    'dys-api-stock',
    '--primary-secret-ref',
    projectIdRef,
    '--rotation',
    '--secondary-secret-ref',
    SECONDARY_REF,
    '--dry-run'
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--primary-secret-ref/);
  assert.match(result.stderr, /project-number/);
  assert.doesNotMatch(result.stdout, /gcloud run services update/);
  assert.ok(!result.stdout.includes(projectIdRef));
  assert.ok(!result.stderr.includes(projectIdRef));
});

test('still accepts short secret-name references', () => {
  const result = runCli(baseArgs(['--rotation', '--secondary-secret-ref', 'api-key-previous:3', '--dry-run']));

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /--update-secrets=API_KEY=api-key-current:latest,API_KEY_SECONDARY=api-key-previous:3/
  );
});

test('rotation docs document the value-free delivery path', () => {
  const docs = readFileSync(ROTATION_DOC, 'utf8');

  for (const expected of [
    'scripts/gcp/configure-api-key-secrets.sh',
    '--primary-secret-ref',
    '--secondary-secret-ref',
    '--rotation',
    '--rollback',
    '--retire-secondary',
    '--update-secrets',
    'API_KEY_SECONDARY',
    'secretAccessor',
    'projects/<project-number>/secrets/<secret-name>:<version>'
  ]) {
    assert.ok(docs.includes(expected), `docs/api-key-rotation.md must document ${expected}`);
  }
  assert.ok(
    !docs.includes('projects/<project-id>/secrets'),
    'fully-qualified secret references must use a numeric project number'
  );
  assert.ok(!docs.includes('--update-env-vars'), 'docs must not suggest inline env secrets');
  assert.ok(!docs.includes('--set-secrets'), 'docs must not replace unrelated secret mappings');
});
