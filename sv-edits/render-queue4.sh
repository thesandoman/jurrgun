#!/usr/bin/env bash
# Morning-only queue for the collage (owner): after the running MRT render.
set -u
S=/Users/sanpitisititpunt/jurgun/.claude/worktrees/brand-kit/sv-edits
B=/Applications/Blender.app/Contents/MacOS/Blender
SVB=$HOME/.sv-edits/blender/make-scenes-blender.py
while pgrep -f "scenes-new/mrt.blend" >/dev/null; do sleep 10; done
echo "mrt finished"
N=$S/scenes-new
run(){ PYTHONDONTWRITEBYTECODE=1 $B -b --factory-startup --python-exit-code 1 --python $SVB -- "$@" 2>&1 | grep -E "SV_(DONE|ERROR|WARN)"; }
run --blend $N/highway-morning.blend --face AdFace --out $N --samples 40
run --blend $N/bus-shelter-morning.blend --face AdFace --kind emissive --out $N --samples 40
run --scene mall-led --out $N --no-captures --samples 40
echo QUEUE4DONE
