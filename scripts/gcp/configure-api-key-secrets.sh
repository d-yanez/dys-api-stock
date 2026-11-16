#!/usr/bin/env bash
#
# Attach the dys-api-stock inbound API keys to Cloud Run as Secret Manager
# references without ever accepting, printing, or storing secret values.
#
# Modes operate on the existing service in place:
#   --rotation           API_KEY = primary reference,
#                        API_KEY_SECONDARY = secondary reference
#   --rollback           swaps the slots: API_KEY = secondary reference,
#                        API_KEY_SECONDARY = primary reference
#   --retire-secondary   API_KEY = primary reference and API_KEY_SECONDARY removed
#
# Only non-secret resource names reach gcloud. --update-secrets is additive, so
# unrelated secret and environment mappings are preserved. --remove-env-vars
# carries names only and clears a plain (non-secret) entry with the same name,
# because Cloud Run rejects replacing a literal environment variable with a
# secret reference; gcloud applies environment removals before secret updates,
# so an existing plainValue API_KEY moves to a secret reference in the same
# revision. gcloud's own service output is discarded (it would print unrelated
# plain environment values); only the new revision name is reported.
set -euo pipefail

readonly SCRIPT_NAME='configure-api-key-secrets'
readonly SECRET_NAME_PATTERN='[a-z][a-z0-9-]{0,254}'
readonly SECRET_VERSION_PATTERN='(latest|[0-9]{1,19})'
readonly PRIMARY_NAME='API_KEY'
readonly SECONDARY_NAME='API_KEY_SECONDARY'

usage() {
  cat <<'EOF'
Usage: configure-api-key-secrets.sh \
  --project <project-id> --region <region> --service <service-name> \
  --primary-secret-ref <secret-name:version> \
  [--secondary-secret-ref <secret-name:version>] \
  (--rotation | --rollback | --retire-secondary) [--dry-run]

Secret references are Cloud Run Secret Manager resource names, never values:
  <secret-name>:<version>
  projects/<project-number>/secrets/<secret-name>:<version>

Modes:
  --rotation           API_KEY=<primary>, API_KEY_SECONDARY=<secondary>
  --rollback           API_KEY=<secondary>, API_KEY_SECONDARY=<primary>
  --retire-secondary   API_KEY=<primary>; API_KEY_SECONDARY removed

--dry-run prints the gcloud command with resource names only and exits.
EOF
}

fail() {
  printf '%s: %s\n' "${SCRIPT_NAME}" "$*" >&2
  exit 2
}

take_value() {
  local flag="$1" count="$2" value="${3-}"
  if (( count < 2 )) || [[ -z "${value}" ]]; then
    fail "${flag} requires a non-empty value"
  fi
}

validate_secret_ref() {
  local flag="$1" ref="$2"
  local short_pattern="^${SECRET_NAME_PATTERN}:${SECRET_VERSION_PATTERN}$"
  local full_pattern="^projects/[0-9]{1,19}/secrets/${SECRET_NAME_PATTERN}:${SECRET_VERSION_PATTERN}$"

  # shellcheck disable=SC2053 # unquoted patterns keep bash 3.2 regex matching
  if [[ ! "${ref}" =~ ${short_pattern} && ! "${ref}" =~ ${full_pattern} ]]; then
    fail "${flag} must be a Secret Manager resource name (secret-name:version or projects/<project-number>/secrets/<secret-name>:version); secret values are never accepted"
  fi
}

project=''
region=''
service=''
primary_ref=''
secondary_ref=''
mode=''
dry_run=0

while (( $# > 0 )); do
  case "$1" in
    --project)
      take_value "$1" "$#" "${2-}"
      project="$2"
      shift 2
      ;;
    --region)
      take_value "$1" "$#" "${2-}"
      region="$2"
      shift 2
      ;;
    --service)
      take_value "$1" "$#" "${2-}"
      service="$2"
      shift 2
      ;;
    --primary-secret-ref)
      take_value "$1" "$#" "${2-}"
      primary_ref="$2"
      shift 2
      ;;
    --secondary-secret-ref)
      take_value "$1" "$#" "${2-}"
      secondary_ref="$2"
      shift 2
      ;;
    --rotation | --rollback | --retire-secondary)
      if [[ -n "${mode}" ]]; then
        fail 'specify exactly one of --rotation, --rollback or --retire-secondary'
      fi
      mode="$1"
      shift
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    --help | -h)
      usage
      exit 0
      ;;
    *)
      fail 'unknown argument; run with --help for the supported flags'
      ;;
  esac
done

[[ -n "${project}" ]] || fail '--project is required'
[[ -n "${region}" ]] || fail '--region is required'
[[ -n "${service}" ]] || fail '--service is required'
[[ -n "${primary_ref}" ]] || fail '--primary-secret-ref is required'
[[ -n "${mode}" ]] || fail 'exactly one of --rotation, --rollback or --retire-secondary is required'

validate_secret_ref '--primary-secret-ref' "${primary_ref}"

case "${mode}" in
  --rotation | --rollback)
    [[ -n "${secondary_ref}" ]] || fail "${mode} requires --secondary-secret-ref"
    validate_secret_ref '--secondary-secret-ref' "${secondary_ref}"
    ;;
  --retire-secondary)
    if [[ -n "${secondary_ref}" ]]; then
      fail '--retire-secondary must not receive --secondary-secret-ref'
    fi
    ;;
esac

cmd=(gcloud run services update "${service}" "--project=${project}" "--region=${region}" --quiet)

case "${mode}" in
  --rotation)
    cmd+=("--update-secrets=${PRIMARY_NAME}=${primary_ref},${SECONDARY_NAME}=${secondary_ref}")
    cmd+=("--remove-env-vars=${PRIMARY_NAME},${SECONDARY_NAME}")
    ;;
  --rollback)
    cmd+=("--update-secrets=${PRIMARY_NAME}=${secondary_ref},${SECONDARY_NAME}=${primary_ref}")
    cmd+=("--remove-env-vars=${PRIMARY_NAME},${SECONDARY_NAME}")
    ;;
  --retire-secondary)
    cmd+=("--update-secrets=${PRIMARY_NAME}=${primary_ref}")
    cmd+=("--remove-env-vars=${PRIMARY_NAME},${SECONDARY_NAME}")
    cmd+=("--remove-secrets=${SECONDARY_NAME}")
    ;;
esac

if (( dry_run )); then
  printf '%s\n' "${cmd[*]}"
  exit 0
fi

if ! command -v gcloud >/dev/null 2>&1; then
  fail 'gcloud is required on PATH; use --dry-run to inspect the command without deploying'
fi

# Discard stdout: gcloud prints the resulting service, including unrelated
# plain environment values. Failures still surface on stderr with a non-zero exit.
"${cmd[@]}" >/dev/null

revision="$(gcloud run services describe "${service}" \
  "--project=${project}" \
  "--region=${region}" \
  --format='value(status.latestReadyRevisionName)')"

printf '%s: %s updated; revision %s\n' "${SCRIPT_NAME}" "${service}" "${revision:-unknown}"
