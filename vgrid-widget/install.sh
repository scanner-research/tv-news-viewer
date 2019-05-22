#!/bin/bash

set -e

WIDGET_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

cd $WIDGET_DIR/../deps/vgrid/vgridjs

rm -rf node_modules package-lock.json
npm install
npm run build
sudo npm link

cd $WIDGET_DIR

rm -rf node_modules package-lock.json
npm install
npm link @wcrichto/vgrid
npm run build
