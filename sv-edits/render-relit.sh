#!/usr/bin/env bash
# Relight the two SV Blender scenes (morning, night) and render each through SV Blender's own-.blend route.
set -u
S=/Users/sanpitisititpunt/jurgun/.claude/worktrees/brand-kit/sv-edits
B=/Applications/Blender.app/Contents/MacOS/Blender
SVB=$HOME/.sv-edits/blender/make-scenes-blender.py
R=$S/scenes-relit; mkdir -p $R
for job in "skytrain-billboard morning" "skytrain-billboard night" "shopfront-sign morning" "shopfront-sign night"; do
  set -- $job; sc=$1; mode=$2; tag=$sc-$mode
  PYTHONDONTWRITEBYTECODE=1 $B -b --factory-startup --python-exit-code 1 --python $S/relight.py -- --in $S/scenes/$sc/$sc.blend --mode $mode --out $R/$tag.blend 2>&1 | grep SV_RELIGHT
  if [ $sc = skytrain-billboard ]; then FACE=DESIGN_billboard; EXTRA="--design $S/designs/billboard-2400x900.png"; else FACE="DESIGN_lightbox,DESIGN_window-poster"; EXTRA=""; fi
  PYTHONDONTWRITEBYTECODE=1 $B -b --factory-startup --python-exit-code 1 --python $SVB -- --blend $R/$tag.blend --face "$FACE" --out $R --samples 96 $EXTRA 2>&1 | grep -E "SV_(DONE|ERROR|WARN)"
done
echo ALLDONE
