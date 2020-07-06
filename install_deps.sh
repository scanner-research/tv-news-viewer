#!/bin/bash

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
DEPS_DIR=$SCRIPT_DIR/deps

cd $SCRIPT_DIR
git submodule init && git submodule update

cd $DEPS_DIR/caption-index
rustup override remove
python3 setup.py install --user

cd $DEPS_DIR/rs-intervalset
rustup override remove
python3 setup.py install --user

echo 'Done!'
