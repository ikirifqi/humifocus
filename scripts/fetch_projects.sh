#!/bin/sh
# Print a HumiFocus login's projects as JSON, with the ids fetch_metrics.sh takes.
#
#   FIREBASE_API_KEY=... FIREBASE_PROJECT_ID=... scripts/fetch_projects.sh EMAIL PASSWORD

set -eu

# shellcheck source=scripts/firebase.sh
. "$(dirname "$0")/firebase.sh"

[ $# -eq 2 ] || fail 'usage: fetch_projects.sh EMAIL PASSWORD'

sign_in "$1" "$2"
list_projects
