#!/usr/bin/env bash
set -Eeuo pipefail

# Required: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, BACKUP_DIR, BACKUP_ENCRYPTION_RECIPIENT
# Optional: BACKUP_PREFIX (default papertrail), BACKUP_RETENTION_HOURS (default 48),
#           BACKUP_DAILY_DAYS (default 30), BACKUP_MONTHLY_MONTHS (default 12).

required=(TURSO_DATABASE_URL TURSO_AUTH_TOKEN BACKUP_DIR BACKUP_ENCRYPTION_RECIPIENT)
for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || { echo "Missing required environment variable: $name" >&2; exit 2; }
done
command -v age >/dev/null || { echo "age is required for encrypted backups." >&2; exit 2; }
command -v curl >/dev/null || { echo "curl is required for Turso exports." >&2; exit 2; }
command -v gzip >/dev/null || { echo "gzip is required for backup compression." >&2; exit 2; }
command -v sha256sum >/dev/null || { echo "sha256sum is required for verification." >&2; exit 2; }
command -v sqlite3 >/dev/null || { echo "sqlite3 is required to verify a restore." >&2; exit 2; }
command -v flock >/dev/null || { echo "flock is required to prevent overlapping backups." >&2; exit 2; }

case "$TURSO_DATABASE_URL" in
  libsql://*) database_url="https://${TURSO_DATABASE_URL#libsql://}" ;;
  https://*) database_url="$TURSO_DATABASE_URL" ;;
  *) echo "TURSO_DATABASE_URL must start with libsql:// or https://" >&2; exit 2 ;;
esac
database_url="${database_url%/}"
prefix="${BACKUP_PREFIX:-papertrail}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.backup.lock"
flock -n 9 || { echo "Another backup is already running." >&2; exit 0; }

workdir="$(mktemp -d "$BACKUP_DIR/.working.XXXXXX")"
cleanup() { rm -rf "$workdir"; }
trap cleanup EXIT

timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
artifact="$BACKUP_DIR/$prefix-$timestamp.sql.gz.age"
dump="$workdir/database.sql"
verify_db="$workdir/verify.sqlite"

curl --fail --silent --show-error --location --retry 3 --retry-all-errors --connect-timeout 20 \
  -H "Authorization: Bearer $TURSO_AUTH_TOKEN" \
  "$database_url/dump" \
  -o "$dump"

[[ -s "$dump" ]] || { echo "Turso returned an empty dump; retaining existing backups." >&2; exit 1; }
sqlite3 "$verify_db" < "$dump"
[[ "$(sqlite3 "$verify_db" 'PRAGMA integrity_check;')" == "ok" ]] || { echo "SQLite integrity check failed; retaining existing backups." >&2; exit 1; }

gzip -9 -c "$dump" | age --encrypt --recipient "$BACKUP_ENCRYPTION_RECIPIENT" > "$artifact"
[[ -s "$artifact" ]] || { echo "Encrypted backup was empty; retaining existing backups." >&2; exit 1; }
checksum="$(sha256sum "$artifact" | awk '{print $1}')"
size="$(stat --printf='%s' "$artifact")"
migrations="$(sqlite3 "$verify_db" "SELECT group_concat(id, ',') FROM schema_migrations ORDER BY id;" 2>/dev/null || true)"

printf '%s\n' "$checksum  $(basename "$artifact")" > "$artifact.sha256"
cat > "$artifact.json" <<EOF
{"createdAt":"$(date -u +%FT%TZ)","source":"${database_url#https://}","format":"sqlite-sql-dump-gzip-age","sha256":"$checksum","bytes":$size,"migrations":"${migrations:-unknown}","integrityCheck":"ok"}
EOF
chmod 600 "$artifact" "$artifact.sha256" "$artifact.json"

"$(dirname "$0")/prune-backups.sh"
echo "Verified encrypted backup written: $artifact"
