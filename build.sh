#!/bin/bash

cd $(dirname $0)

OUTFILE=dist/vimulator.js

BUILD_ORDER=(
	base
	renderer
	demo_renderer
	search
	utils
	range
	operation
	command
	command_list
	arguments
	words
	text_objects
	normal_mode
	normal_mode/motions
	normal_mode/marks
	normal_mode/insertion
	normal_mode/edits
	normal_mode/line_search
	normal_mode/search
	normal_mode/operators
	normal_mode/repeat
	normal_mode/yank
	insert_mode
	insert_mode/commands
)

echo "" > $OUTFILE
echo "// Vimulator - build-`date +%d%m%Y%H%M` " >> $OUTFILE

for arg in ${BUILD_ORDER[*]}; do
	echo "" >> $OUTFILE
	echo "// $arg.js" >> $OUTFILE
	cat js/$arg.js >> $OUTFILE
done
