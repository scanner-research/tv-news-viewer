#!/bin/bash

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
DEPS_DIR=$SCRIPT_DIR/deps

RUST_VERSION=nightly-2019-09-01

cd $DEPS_DIR/caption-index
rustup override set $RUST_VERSION
python3 setup.py install --user

cd $DEPS_DIR/rs-intervalset
rustup override set $RUST_VERSION
python3 setup.py install --user
