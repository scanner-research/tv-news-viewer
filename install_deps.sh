#!/bin/bash

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
DEPS_DIR=$SCRIPT_DIR/deps

cd $DEPS_DIR/caption-index
rustup override set nightly
python3 setup.py install --user

cd $DEPS_DIR/rs-intervalset
rustup override set nightly
python3 setup.py install --user
