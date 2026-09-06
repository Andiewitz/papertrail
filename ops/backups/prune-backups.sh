#!/usr/bin/env bash
set -Eeuo pipefail

: "${BACKUP_DIR:?BACKUP_DIR is required}"
prefix="${BACKUP_PREFIX:-papertrail}"
recent_hours="${BACKUP_RETENTION_HOURS:-48}"
daily_days="${BACKUP_DAILY_DAYS:-30}"
monthly_months="${BACKUP_MONTHLY_MONTHS:-12}"
now="$(date +%s)"
declare -A daily monthly

while IFS= read -r file; do
  modified="$(stat --printf='%Y' "$file")"
  age_hours=$(( (now - modified) / 3600 ))
  age_days=$(( age_hours / 24 ))
  day="$(date -u -d "@$modified" +%F)"
  month="$(date -u -d "@$modified" +%Y-%m)"
  keep=false
  if (( age_hours <= recent_hours )); then keep=true
  elif (( age_days <= daily_days )) && [[ -z "${daily[$day]:-}" ]]; then daily[$day]=1; keep=true
  elif (( age_days <= monthly_months * 31 )) && [[ -z "${monthly[$month]:-}" ]]; then monthly[$month]=1; keep=true
  fi
  if [[ "$keep" == false ]]; then
    rm -f -- "$file" "$file.sha256" "$file.json"
    echo "Pruned $(basename "$file")"
  fi
done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$prefix-*.sql.gz.age" -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)
