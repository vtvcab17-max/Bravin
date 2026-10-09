#!/bin/sh
# $1 = src name, $2 = out name, [$3 ss, $4 t]
S=/home/claude/src
G="eq=brightness=0.035:contrast=1.06:saturation=1.16:gamma=1.04,curves=master='0/0 0.25/0.28 0.5/0.56 0.75/0.8 1/1',colorbalance=bs=0.035:bm=0.015:rh=-0.01"
EXTRA=""; [ -n "$3" ] && EXTRA="-ss $3 -t $4"; GR=",$G"; [ "$1" = b13 ] && GR=""
ffmpeg -v error -y $EXTRA -i $S/$1.mp4 -vf "scale=540:960$GR,fps=30,format=yuv420p" -c:v libx264 -preset medium -crf 29 -g 15 -keyint_min 15 -sc_threshold 0 -profile:v main -an -movflags +faststart $2.mp4
