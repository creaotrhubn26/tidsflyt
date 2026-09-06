#!/usr/bin/env bash
#
# demo/transkoder.sh — turn the Playwright captures into editable footage.
#
# Playwright writes VP8 in a WebM container. Most editors either refuse it or
# decode it badly, and the files carry no frame rate an editor can trust, so a
# straight import drifts out of sync. This normalises every take to H.264 MP4 at
# a fixed 30 fps, named after its beat rather than after Playwright's directory
# hashes.
#
# Usage:  bash demo/transkoder.sh
# Output: demo/klipp/hovedversjon/*.mp4 and demo/klipp/reels/*.mp4
set -euo pipefail

cd "$(dirname "$0")/.."
KILDE="demo/opptak"
MAAL="demo/klipp"

command -v ffmpeg >/dev/null || { echo "ffmpeg mangler — brew install ffmpeg"; exit 1; }
[ -d "$KILDE" ] || { echo "Fant ingen opptak i $KILDE. Kjør npm run demo:capture først."; exit 1; }

rm -rf "$MAAL"
antall=0

while IFS= read -r fil; do
  mappe=$(basename "$(dirname "$fil")")
  del=$(basename "$(dirname "$(dirname "$fil")")")   # hovedversjon | reels

  # Playwright names the directory after the test title. Strip its prefix and
  # the trailing "-opptak" so the file is named for the beat.
  navn=$(printf '%s' "$mappe" \
    | sed -E 's/^turnus-(demo|reels)-//; s/-opptak$//; s/-—-/-/g; s/-+/-/g')

  ut="$MAAL/$del"
  mkdir -p "$ut"

  # -nostdin is load-bearing, not decoration: without it ffmpeg consumes the
  # while-loop's stdin and the next iteration reads a truncated path. The first
  # run of this script died on "emo/opptak/..." for exactly that reason.
  #
  # -r 30 before -i is deliberate: the captures have no reliable timebase, so
  # the frame rate is asserted on input rather than resampled on output.
  ffmpeg -nostdin -loglevel error -y -r 30 -i "$fil" \
    -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
    -movflags +faststart -an \
    "$ut/$navn.mp4"

  printf '  %-14s %s.mp4\n' "$del" "$navn"
  antall=$((antall + 1))
done < <(find "$KILDE" -name '*.webm' | sort)

echo
echo "$antall klipp transkodet til $MAAL/"
