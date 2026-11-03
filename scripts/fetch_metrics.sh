#!/bin/sh
# Print one day's focus time and notes per project as JSON, read from Firestore's REST API with
# a HumiFocus login. Requires curl and jq.
#
#   FIREBASE_API_KEY=... FIREBASE_PROJECT_ID=... scripts/fetch_metrics.sh EMAIL PASSWORD DAY
#
# DAY is `today`, `yesterday`, or YYYY-MM-DD, in the timezone of the TZ environment variable.
# Only finished sessions count: the running timer is not part of the history until it closes.

set -eu

fail() {
	echo "fetch_metrics: $1" >&2
	exit 1
}

[ $# -eq 3 ] || fail 'usage: fetch_metrics.sh EMAIL PASSWORD today|yesterday|YYYY-MM-DD'
[ -n "${FIREBASE_API_KEY:-}" ] || fail 'FIREBASE_API_KEY must be set'
[ -n "${FIREBASE_PROJECT_ID:-}" ] || fail 'FIREBASE_PROJECT_ID must be set'

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

# Exit with the message of a Firebase error response, if this is one.
check() {
	message=$(printf '%s' "$1" |
		jq -r '(if type == "array" then .[0] else . end) | .error.message? // empty')
	[ -z "$message" ] || fail "$2: $message"
}

auth=$(jq -n --arg email "$email" --arg password "$password" \
	'{ $email, $password, returnSecureToken: true }' |
	curl -sS "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$FIREBASE_API_KEY" \
		-H 'Content-Type: application/json' -d @-)
check "$auth" 'sign-in failed'
token=$(printf '%s' "$auth" | jq -r .idToken)
user_id=$(printf '%s' "$auth" | jq -r .localId)

# Run a structured query on the signed-in user's document, reading the query from stdin.
run_query() {
	curl -sS "https://firestore.googleapis.com/v1/projects/$FIREBASE_PROJECT_ID/databases/(default)/documents/users/${user_id}:runQuery" \
		-H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d @-
}

projects=$(jq -n '{ structuredQuery: { from: [{ collectionId: "projects" }] } }' | run_query)
check "$projects" 'reading projects failed'
names=$(printf '%s' "$projects" | jq -c '
	[.[].document // empty | { key: (.name | split("/") | last), value: .fields.name.stringValue }]
	| from_entries')

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
