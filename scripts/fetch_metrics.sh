#!/bin/sh
# Print one day's focus time and notes per project as JSON, read from Firestore's REST API with
# a HumiFocus login. Requires curl and jq.
#
#   FIREBASE_API_KEY=... FIREBASE_PROJECT_ID=... scripts/fetch_metrics.sh EMAIL PASSWORD DAY
#
# DAY is `today`, `yesterday`, or YYYY-MM-DD, in the timezone of the TZ environment variable.
# Only finished sessions count: the running timer is not part of the history until it closes.

set -eu

# shellcheck source=scripts/firebase.sh
. "$(dirname "$0")/firebase.sh"

[ $# -eq 3 ] || fail 'usage: fetch_metrics.sh EMAIL PASSWORD today|yesterday|YYYY-MM-DD'

email=$1
password=$2
day=$3

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
names=$(printf '%s' "$projects" | jq -c 'map({ key: .id, value: .name }) | from_entries')

sessions=$(jq -n --arg from "${from}000" --arg to "${to}000" '
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
check "$sessions" 'reading sessions failed'

printf '%s' "$sessions" | jq --arg date "$day" --argjson names "$names" '
	def hours: . / 36000 | round / 100;
	def total: map(.totalMs.integerValue | tonumber) | add // 0;
	[.[].document.fields // empty]
	| {
		date: $date,
		hours: (total | hours),
		totalMs: total,
		sessions: length,
		projects: (
			group_by(.projectId.stringValue)
			| map({
				id: .[0].projectId.stringValue,
				name: ($names[.[0].projectId.stringValue] // "Deleted project"),
				hours: (total | hours),
				totalMs: total,
				sessions: length,
				notes: [
					.[].notes.arrayValue.values[]?.mapValue.fields
					| {
						at: (.at.integerValue | tonumber / 1000 | floor | todate),
						text: .text.stringValue
					}
				]
			})
			| sort_by(-.totalMs)
		)
	}'
