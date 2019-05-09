# TV News Viewer

#### Setup Instructions

1. Install Rust
2. Clone submodules: `git submodule init && git submodule update`
3. Follow the setup instructions in `deps/caption-index`
   and `deps/rs-intervalset`
4. Install python dependencies: `pip3 install -r requirements.txt`
5. Copy over indexed captions
6. Copy over data directory
7. Run `develop.py` to start a development server or edit `config.json` to
   serve using wsgi.

#### Running Tests

`pytest -v tests`
