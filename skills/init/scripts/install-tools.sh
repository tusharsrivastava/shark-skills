#!/bin/sh
# Installs the tools of shark into the shark tool folder (the plugin data folder), the same on each machine.
#
#   sh install-tools.sh --dir <tool folder> <tool>...      tools: opengrep, lizard, debugpy
#
# opengrep  <dir>/bin/opengrep: the release binary, SHA-256 checked (install-opengrep.sh). Never the PyPI name.
# lizard    <dir>/venv: a virtual environment with the pinned Lizard, hash checked (requirements/lizard.txt).
# debugpy   <dir>/debugpy: the pinned pure-Python debugpy, hash checked (requirements/debugpy.txt). Each project
#           interpreter loads it through PYTHONPATH, so it never goes into the project environment.
#
# It needs only python3 (3.9 or later) with the venv module, and never uses sudo or the system site-packages. A
# Python that is "externally managed" (PEP 668) is not a problem: nothing installs into it.
set -eu

here="$(cd "$(dirname "$0")" && pwd)"
dir=""
tools=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) dir="${2:-}"; shift 2 ;;
    opengrep|lizard|debugpy) tools="$tools $1"; shift ;;
    *) echo "install-tools: unknown argument $1. Usage: install-tools.sh --dir <tool folder> opengrep|lizard|debugpy..." >&2; exit 2 ;;
  esac
done
if [ -z "$dir" ] || [ -z "$tools" ]; then
  echo "install-tools: usage: install-tools.sh --dir <tool folder> opengrep|lizard|debugpy..." >&2
  exit 2
fi
mkdir -p "$dir"

venv() {
  if [ -x "$dir/venv/bin/python" ]; then return 0; fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "install-tools: python3 not found. Install Python 3.9 or later." >&2
    exit 1
  fi
  if ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'; then
    echo "install-tools: $(python3 --version 2>&1) is too old. Install Python 3.9 or later." >&2
    exit 1
  fi
  if ! python3 -m venv "$dir/venv"; then
    rm -rf "$dir/venv"
    echo "install-tools: python3 cannot make a virtual environment. Debian and Ubuntu: install the python3-venv package." >&2
    exit 1
  fi
}

pip_install() { # <requirements file> [pip options]
  req="$1"; shift
  "$dir/venv/bin/python" -m pip install --quiet --disable-pip-version-check --no-input --isolated \
    --require-hashes --only-binary=:all: --no-deps -r "$req" "$@"
}

for tool in $tools; do
  case "$tool" in
    opengrep)
      # The tool folder needs no PATH entry: shark puts it first on PATH when it runs an analyzer.
      out="$(sh "$here/../../code-health/scripts/install-opengrep.sh" "$dir/bin")" || exit 1
      printf '%s\n' "$out" | grep -v " to PATH$" || true
      ;;
    lizard)
      venv
      pip_install "$here/requirements/lizard.txt"
      echo "install-tools: installed $("$dir/venv/bin/lizard" --version) at $dir/venv/bin/lizard"
      ;;
    debugpy)
      venv
      tmp="$dir/.debugpy.$$"
      rm -rf "$tmp"
      pip_install "$here/requirements/debugpy.txt" --target "$tmp"
      rm -rf "$dir/debugpy"
      mv "$tmp" "$dir/debugpy"
      echo "install-tools: installed debugpy $(PYTHONPATH="$dir/debugpy" python3 -c 'import debugpy; print(debugpy.__version__)') at $dir/debugpy"
      ;;
  esac
done
