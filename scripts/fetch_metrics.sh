#!/bin/sh
# Print one day's focus time and notes for a HumiFocus project as JSON, read from Firestore's REST
# API with a HumiFocus login. fetch_projects.sh lists the project ids.
#
#   FIREBASE_API_KEY=... FIREBASE_PROJECT_ID=... scripts/fetch_metrics.sh PROJECT_ID EMAIL PASSWORD DAY
#
# DAY is `today`, `yesterday`, or YYYY-MM-DD, in the timezone of the TZ environment variable.
# Only finished sessions count: the running timer is not part of the history until it closes.

set -eu

# shellcheck source=scripts/firebase.sh
. "$(dirname "$0")/firebase.sh"

[ $# -eq 4 ] || fail 'usage: fetch_metrics.sh PROJECT_ID EMAIL PASSWORD today|yesterday|YYYY-MM-DD'
[ -n "$1" ] || fail 'PROJECT_ID must not be empty'

project=$1
email=$2
password=$3
day=$4

# `date` takes different flags on macOS (BSD) and on Linux (GNU and BusyBox).
if date -j >/dev/null 2>&1; then
	midnight() { date -j -f '%Y-%m-%d %H:%M:%S' "$1 00:00:00" +%s 2>/dev/null; }
	date_of() { date -r "$1" +%F; }
else
	midnight() { date -d "$1 00:00:00" +%s 2>/dev/null; }
	date_of() { date -d "@$1" +%F; }
fi

# Stepping to a neighbouring day goes via its middle, as a day across a daylight saving change
# is not 24 hours.
case $day in
	today) day=$(date +%F) ;;
	yesterday) day=$(date_of $(($(midnight "$(date +%F)") - 43200))) ;;
	[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
	*) fail "DAY must be today, yesterday, or YYYY-MM-DD, not '$day'" ;;
esac
from=$(midnight "$day") || fail "'$day' is not a valid date"
[ "$(date_of "$from")" = "$day" ] || fail "'$day' is not a valid date"
to=$(midnight "$(date_of $((from + 129600)))")

sign_in "$email" "$password"

projects=$(list_projects)
name=$(printf '%s' "$projects" | jq -r --arg project "$project" \
	'map(select(.id == $project))[0].name // empty')

# Sessions are filtered by project here, as filtering on it in the query needs a composite index.
all_sessions=$(jq -n --arg from "${from}000" --arg to "${to}000" '
	def bound($op; $value): {
		fieldFilter: { field: { fieldPath: "start" }, op: $op, value: { integerValue: $value } }
	};
	{ structuredQuery: {
		from: [{ collectionId: "sessions" }],
		where: { compositeFilter: { op: "AND", filters: [
			bound("GREATER_THAN_OR_EQUAL"; $from), bound("LESS_THAN"; $to)
		] } },
		orderBy: [{ field: { fieldPath: "start" } }]
	} }' | run_query)
check "$all_sessions" 'reading sessions failed'
sessions=$(printf '%s' "$all_sessions" | jq -c --arg project "$project" \
	'[.[].document.fields // empty | select(.projectId.stringValue == $project)]')

# A deleted project keeps its history, so only an unknown id with no sessions is a mistake.
[ -n "$name" ] || [ "$sessions" != '[]' ] || fail "no project with id '$project'"

printf '%s' "$sessions" | jq --arg date "$day" --arg id "$project" \
	--arg name "${name:-Deleted project}" '
	(map(.totalMs.integerValue | tonumber) | add // 0) as $ms
	| {
		date: $date,
		project: { $id, $name },
		hours: ($ms / 36000 | round / 100),
		totalMs: $ms,
		sessions: length,
		notes: [
			.[].notes.arrayValue.values[]?.mapValue.fields
			| {
				at: (.at.integerValue | tonumber / 1000 | floor | todate),
				text: .text.stringValue
			}
		]
	}'
