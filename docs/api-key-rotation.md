# API key rotation (dual-key, zero downtime)

This service authenticates `/api` requests with the `x-api-key` header. During
credential rotation it temporarily accepts two keys so callers can migrate
without a 401/403 window.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `API_KEY` | yes | Primary accepted key. Existing name and behavior are unchanged. |
| `API_KEY_SECONDARY` | no | Temporary second accepted key for the rotation window only. |

Placeholders only, never real values:

```text
API_KEY=<primary-api-key>
API_KEY_SECONDARY=<previous-api-key>
```

Fail-closed rules:

- If `API_KEY` is missing or blank, every request is rejected with `403`, even
  when `API_KEY_SECONDARY` is set. The primary key is authoritative.
- If `API_KEY` is configured and `API_KEY_SECONDARY` is unset, empty, or
  whitespace, only `API_KEY` is accepted.
- An unknown key gets `403 {"error":"API key invalid"}`; a missing header gets
  `401 {"error":"API key missing"}`.

## Delivery mechanism

Both keys are delivered to Cloud Run as Secret Manager references, never as
inline values. `scripts/gcp/configure-api-key-secrets.sh` builds a single
`gcloud run services update` call that:

- passes only non-secret resource names in `--update-secrets`;
- uses the additive `--update-secrets` form, so unrelated secret and
  environment mappings stay in place;
- adds `--remove-env-vars` with the two variable *names* only, because Cloud Run
  rejects replacing a literal environment variable with a secret reference.
  gcloud applies environment removals before secret updates, so an existing
  plainValue `API_KEY` becomes a secret reference in the same revision.
  Missing literal entries are ignored, which makes the transition idempotent;
- discards gcloud's own service output, which would print unrelated plain
  environment values, and reports only the new revision name;
- never accepts, prints, or stores a secret value, and is safe to run with
  `--dry-run` first.

Prerequisites:

- The Secret Manager secrets exist with non-secret resource names, for example
  `projects/<project-number>/secrets/<secret-name>:<version>`. Fully-qualified
  references require the numeric project number, exactly as gcloud accepts
  them. Short `<secret-name>:<version>` references are also accepted; the
  version is mandatory (`latest` or a numeric version).
- The Cloud Run runtime service account
  `sa-dys-api-stock@<project-id>.iam.gserviceaccount.com` holds
  `roles/secretmanager.secretAccessor` on each referenced secret.
- The operator holds Cloud Run update permissions on the service. No secret
  value is needed on the command line.

### Rotation window (primary new, secondary previous)

```bash
scripts/gcp/configure-api-key-secrets.sh \
  --project <project-id> \
  --region <region> \
  --service <cloud-run-service> \
  --primary-secret-ref projects/<project-number>/secrets/<primary-secret-name>:<version> \
  --secondary-secret-ref projects/<project-number>/secrets/<previous-secret-name>:<version> \
  --rotation
```

### Rollback (swap the slots)

The same two references, with the slots exchanged:

```bash
scripts/gcp/configure-api-key-secrets.sh \
  --project <project-id> \
  --region <region> \
  --service <cloud-run-service> \
  --primary-secret-ref projects/<project-number>/secrets/<primary-secret-name>:<version> \
  --secondary-secret-ref projects/<project-number>/secrets/<previous-secret-name>:<version> \
  --rollback
```

### Retire the secondary key

```bash
scripts/gcp/configure-api-key-secrets.sh \
  --project <project-id> \
  --region <region> \
  --service <cloud-run-service> \
  --primary-secret-ref projects/<project-number>/secrets/<primary-secret-name>:<version> \
  --retire-secondary
```

`--retire-secondary` removes the `API_KEY_SECONDARY` secret mapping and any
literal entry with that name, leaving `API_KEY` in place.

### Fail-closed behavior

The script exits non-zero before calling gcloud when the project, region,
service, primary reference, or exactly one rotation mode is missing, when the
rotation/rollback mode has no secondary reference, when `--retire-secondary`
receives a secondary reference, or when a reference is missing its version or
does not look like a Secret Manager resource name. Rejected references are not
echoed back, so an accidentally supplied value is not written to logs.

The normal image deploy in `cloudbuild.yaml` intentionally passes no
environment or secret flags, so redeploying the image preserves every existing
mapping, including these references.

## Rotation runbook

All steps are reversible until the old key is deleted.

1. Create the new secret version in Secret Manager and confirm the runtime
   service account can read it. Do not print values in terminals, tickets, or
   chat.
2. Run the script in `--rotation` mode with the new secret as the primary
   reference and the current secret as the secondary reference, so both keys
   are accepted while `API_KEY` points at the new secret.
3. Migrate every consumer that holds the old key to the new key in reversible
   batches, verifying traffic between batches.
4. Confirm no request authenticates with the old key. Auth failures are logged
   without credential material, so logs cannot be used to fingerprint keys.
5. Run the script in `--retire-secondary` mode. The middleware then accepts
   only the new primary key.
6. Delete the old secret version or secret from Secret Manager.

Rollback: run the script in `--rollback` mode with the same two references. The
slots swap, so the old key becomes primary again while the newer key stays
acceptable.

## Logging guarantee

The middleware logs only the event name, `location`, `ip`, and `path`. It never
logs the presented `x-api-key` value, the configured keys, or any other
credential material, including for rejected requests.

The presented key is compared with a timing-safe comparison appropriate for
variable-length strings: byte lengths are checked first (a mismatch is rejected
without reading the value), then equal-length buffers are compared with
`crypto.timingSafeEqual`. Multi-byte keys cannot throw, and both configured
slots are always checked so the response does not reveal which key matched.

## Tests

```bash
node --experimental-test-module-mocks --test test/api-key-auth.test.js test/api-key-auth.missing-primary.test.js
node --test test/deployment-api-key-secondary.test.js
```
