#!/usr/bin/env python3
"""Validates the SVG path data in src/components/map-glyphs.ts.

A malformed path renders as nothing at all rather than raising, so a typo would
ship as an invisible marker and only be noticed by someone wondering where
their point went. This checks each command's argument count and that every path
starts with a move.

Usage: python scripts/check_glyph_paths.py src/components/map-glyphs.ts
"""
import re
import sys

ARGS = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'C': 6, 'S': 4, 'Q': 4, 'T': 2, 'A': 7, 'Z': 0}

src = open(sys.argv[1], encoding='utf-8').read()

# Scope to the GLYPH_PATHS object. The ALIASES map below it has the same
# `key: 'value',` shape and would otherwise be parsed as if it were path data.
block = re.search(r'GLYPH_PATHS[^=]*=\s*\{(.*?)\n\};', src, re.S)
if not block:
    sys.exit('could not find the GLYPH_PATHS block')

paths = re.findall(r"^\s*(\w+):\s*'([^']+)',", block.group(1), re.M)
if not paths:
    sys.exit('no paths found — did the file format change?')

bad = 0
for name, d in paths:
    tokens = re.findall(r'([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+)', d)
    cmds = []
    for letter, num in tokens:
        if letter:
            cmds.append([letter, []])
        elif cmds:
            cmds[-1][1].append(float(num))
        else:
            print(f'  {name}: number before any command')
            bad += 1
            break

    if not cmds:
        print(f'  {name}: no commands')
        bad += 1
        continue

    problems = []
    if cmds[0][0].upper() != 'M':
        problems.append(f'starts with {cmds[0][0]}, not M')
    for letter, nums in cmds:
        need = ARGS[letter.upper()]
        if need == 0:
            if nums:
                problems.append(f'Z carries {len(nums)} args')
        elif not nums or len(nums) % need != 0:
            problems.append(f'{letter} has {len(nums)} args, not a multiple of {need}')

    if problems:
        bad += 1
        for p in problems:
            print(f'  {name}: {p}')
    else:
        print(f'  {name}: ok ({len(cmds)} commands)')

print(f'\n{len(paths)} glyph paths, {bad} bad')
sys.exit(1 if bad else 0)
