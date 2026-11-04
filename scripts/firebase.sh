# Shared by the scripts that read Firestore's REST API with a HumiFocus login. Source it after
# `set -eu`. Requires curl and jq, and FIREBASE_API_KEY and FIREBASE_PROJECT_ID in the environment.

fail() {
	echo "$(basename "$0" .sh): $1" >&2
	exit 1
}

# Exit with the message of a Firebase error response, if this is one.
check() {
	message=$(printf '%s' "$1" |
		jq -r '(if type == "array" then .[0] else . end) | .error.message? // empty')
	[ -z "$message" ] || fail "$2: $message"
}

# Sign in with an email and password, setting `token` and `user_id` for `run_query`.
sign_in() {
	[ -n "${FIREBASE_API_KEY:-}" ] || fail 'FIREBASE_API_KEY must be set'
	[ -n "${FIREBASE_PROJECT_ID:-}" ] || fail 'FIREBASE_PROJECT_ID must be set'
	auth=$(jq -n --arg email "$1" --arg password "$2" \
		'{ $email, $password, returnSecureToken: true }' |
		curl -sS "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$FIREBASE_API_KEY" \
			-H 'Content-Type: application/json' -d @-)
	check "$auth" 'sign-in failed'
	token=$(printf '%s' "$auth" | jq -r .idToken)
	user_id=$(printf '%s' "$auth" | jq -r .localId)
}

# Run a structured query on the signed-in user's document, reading the query from stdin.
run_query() {
	curl -sS "https://firestore.googleapis.com/v1/projects/$FIREBASE_PROJECT_ID/databases/(default)/documents/users/${user_id}:runQuery" \
		-H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d @-
}

# Print the signed-in user's projects as a JSON array, oldest first, as the app lists them.
list_projects() {
	projects=$(jq -n '{ structuredQuery: {
		from: [{ collectionId: "projects" }],
		orderBy: [{ field: { fieldPath: "createdAt" } }]
	} }' | run_query)
	check "$projects" 'reading projects failed'
	printf '%s' "$projects" | jq '[.[].document // empty | {
		id: (.name | split("/") | last),
		name: .fields.name.stringValue,
		color: .fields.color.stringValue
	}]'
}
