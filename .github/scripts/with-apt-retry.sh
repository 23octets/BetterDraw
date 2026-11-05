#!/usr/bin/env bash
# Coupe une installation apt bloquée sur un miroir lent, puis relance.
# La dernière tentative n'a que la limite de son étape : lent vaut mieux qu'échoué.
set -uo pipefail

limit="${APT_RETRY_LIMIT:-90}"
apt_processes='apt-get|dpkg'

# timeout n'attend que son enfant direct : apt peut survivre et garder son verrou.
stop_apt() {
  sudo pkill -TERM -x "$apt_processes" || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    pgrep -x "$apt_processes" > /dev/null || return 0
    sleep 1
  done
  sudo pkill -KILL -x "$apt_processes" || true
  while pgrep -x "$apt_processes" > /dev/null; do sleep 1; done
}

for attempt in 1 2; do
  started=$SECONDS
  timeout --kill-after=10 "$limit" "$@"
  status=$?
  [ "$status" -eq 0 ] && exit 0
  # Seule une expiration du délai justifie une relance : un 137 peut aussi venir d'un manque de mémoire.
  if [ "$status" -ne 124 ] && { [ "$status" -ne 137 ] || [ $((SECONDS - started)) -lt "$limit" ]; }; then
    exit "$status"
  fi
  echo "::warning::Tentative $attempt interrompue après ${limit} s : $*"
  stop_apt
  # une coupure peut laisser dpkg à mi-chemin
  sudo dpkg --configure -a || true
done

exec "$@"
