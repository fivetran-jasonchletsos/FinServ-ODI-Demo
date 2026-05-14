#!/usr/bin/env bash
#
# FinServ-ODI-Demo · one-shot deploy
#
# Pipeline:
#   1. terraform apply           (infra/)
#   2. fivetran deploy           (connectors/sec_edgar, fred, cfpb)
#   3. dbt deps + run + test     (transform/)
#   4. build_snapshot.py         (meridian-app/scripts/)
#   5. npm ci + npm run build    (meridian-app/frontend/)
#   6. git add + commit + push   (triggers GitHub Pages deploy)
#
# Skip steps with --skip=<comma,list>. Valid keys: infra,fivetran,dbt,snapshot,build,push
#
# Examples:
#   ./scripts/deploy.sh                              # everything
#   ./scripts/deploy.sh --skip=infra,push            # local iteration
#   ./scripts/deploy.sh --skip=infra,fivetran,dbt    # snapshot + frontend only
#
set -euo pipefail

# ---------- arg parsing ----------
SKIP=""
for arg in "$@"; do
    case "$arg" in
        --skip=*) SKIP="${arg#--skip=}" ;;
        -h|--help)
            sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "Unknown arg: $arg" >&2
            echo "Usage: $0 [--skip=infra,fivetran,dbt,snapshot,build,push]" >&2
            exit 2
            ;;
    esac
done

skipped() {
    # returns 0 (true) if $1 is in the comma-separated SKIP list
    [[ ",${SKIP}," == *",$1,"* ]]
}

# ---------- pretty headers ----------
BOLD=$'\033[1m'
CYAN=$'\033[36m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
RESET=$'\033[0m'

step() {
    echo
    echo "${CYAN}${BOLD}==>${RESET} ${BOLD}$1${RESET}"
    echo "${CYAN}----------------------------------------------------------${RESET}"
}

skip_msg() {
    echo "${YELLOW}-- skipping $1 (--skip)${RESET}"
}

done_msg() {
    echo "${GREEN}-- $1 done${RESET}"
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
echo "${BOLD}FinServ-ODI-Demo deploy${RESET} — repo: $REPO_ROOT"
[[ -n "$SKIP" ]] && echo "skipping: $SKIP"

# ---------- 1. infra ----------
step "1/6  terraform apply (infra)"
if skipped infra; then
    skip_msg infra
else
    (
        cd infra
        terraform init -input=false
        terraform apply -auto-approve
    )
    done_msg infra
fi

# ---------- 2. fivetran connectors ----------
step "2/6  fivetran deploy (3 connectors)"
if skipped fivetran; then
    skip_msg fivetran
else
    for c in sec_edgar fred cfpb; do
        echo "${BOLD}  · ${c}${RESET}"
        (
            cd "connectors/${c}"
            # Connector SDK CLI: deploys configuration.json + connector.py to Fivetran.
            fivetran deploy
        )
    done
    done_msg fivetran
fi

# ---------- 3. dbt ----------
step "3/6  dbt deps + run + test"
if skipped dbt; then
    skip_msg dbt
else
    (
        cd transform
        dbt deps
        dbt run
        dbt test
    )
    done_msg dbt
fi

# ---------- 4. snapshot ----------
step "4/6  build_snapshot.py"
if skipped snapshot; then
    skip_msg snapshot
else
    (
        cd meridian-app
        python scripts/build_snapshot.py
    )
    done_msg snapshot
fi

# ---------- 5. frontend build ----------
step "5/6  npm ci + npm run build"
if skipped build; then
    skip_msg build
else
    (
        cd meridian-app/frontend
        npm ci
        npm run build
    )
    done_msg build
fi

# ---------- 6. git push ----------
step "6/6  git commit + push (triggers Pages deploy)"
if skipped push; then
    skip_msg push
else
    if [[ -z "$(git status --porcelain)" ]]; then
        echo "${YELLOW}-- working tree clean, nothing to commit${RESET}"
    else
        git add .
        git commit -m "deploy: refresh snapshot + build $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    fi
    git push
    done_msg push
fi

echo
echo "${GREEN}${BOLD}All done.${RESET}"
