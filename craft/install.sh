#!/usr/bin/env bash
# Installs the Craft apps into craft/apps from their GitHub releases and connects them to Claude.
# Mac and Linux (Windows: install.ps1).
#
#   ./install.sh                         every app
#   ./install.sh --only photocraft,pdfcraft
#   ./install.sh --desktop               Mac: also copy the desktop apps to ~/Applications
#   ./install.sh --global                also register them with Claude Code for every folder
#
# Run it again to update: apps already at the latest release are skipped.
set -euo pipefail

CRAFT="$(cd "$(dirname "$0")" && pwd)"
APPS="$CRAFT/apps"
BIN="$CRAFT/bin"
WS="$CRAFT/workspace"
DESKTOP=0
GLOBAL=0
ONLY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --desktop) DESKTOP=1 ;;
    --global) GLOBAL=1 ;;
    --only) ONLY=",${2:?--only needs a list},"; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

case "$(uname -s)" in
  Darwin) OS=mac ;;
  Linux) OS=linux ;;
  *) echo "On Windows, run install.ps1 instead." >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) ARCH=x86_64 ;;
  arm64|aarch64) ARCH=aarch64 ;;
  *) echo "Unsupported processor: $(uname -m)" >&2; exit 1 ;;
esac

mkdir -p "$APPS" "$BIN" "$WS/inbox" "$WS/output"
TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT

# Latest release version of storytold/<app>, e.g. 0.16.0. The releases/latest redirect costs no
# API quota; git is the fallback where that page is blocked.
latest() {
  local url
  url=$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/storytold/$1/releases/latest" 2>/dev/null || true)
  case "$url" in */tag/v*) echo "${url##*/tag/v}"; return ;; esac
  git ls-remote --tags --refs --sort=-v:refname "https://github.com/storytold/$1" 'v*' 2>/dev/null \
    | head -1 | sed 's#.*refs/tags/v##'
}

sha256() {
  if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | awk '{print $1}'
}

# fetch <app> <version> <file> <dest>: download one release file and check it against the
# release's SHA256SUMS.txt.
fetch() {
  local base="https://github.com/storytold/$1/releases/download/v$2" want
  curl -fsSL -o "$4" "$base/$3" || { echo "  could not download $3" >&2; return 1; }
  want=$(curl -fsSL "$base/SHA256SUMS.txt" | awk -v f="$3" '$2 == f || $2 == "*" f {print $1}')
  [ -n "$want" ] || { echo "  $3 is not listed in SHA256SUMS.txt" >&2; return 1; }
  [ "$want" = "$(sha256 "$4")" ] || { echo "  checksum mismatch for $3" >&2; return 1; }
}

install_app() {
  local app="$1" ver dir tmp f cli mnt bundle
  ver=$(latest "$app")
  [ -n "$ver" ] || { echo "$app: could not find its latest release" >&2; return 1; }
  dir="$APPS/$app"
  if [ "$(cat "$dir/VERSION" 2>/dev/null)" = "$ver" ] && [ -x "$BIN/$app-cli" ] \
     && { [ $DESKTOP = 0 ] || [ $OS = linux ] || [ -f "$dir/DESKTOP" ]; }; then
    echo "$app $ver: up to date"
    return 0
  fi
  echo "$app $ver: installing"
  tmp="$TMPROOT/$app"
  mkdir -p "$tmp"

  if [ $OS = linux ]; then
    # The tarball holds the desktop app (bin/<app>) and the CLI (bin/<app>-cli).
    f="$app-$ver-linux-$ARCH.tar.gz"
    fetch "$app" "$ver" "$f" "$tmp/$f" || return 1
    rm -rf "$dir" && mkdir -p "$dir"
    tar -xzf "$tmp/$f" -C "$dir" --strip-components 1 || return 1
    cli="$dir/bin/$app-cli"
  else
    # On the Mac the CLI is its own download; the .app in the DMG holds only the desktop app.
    f="$app-cli-$ver-macos-universal.zip"
    fetch "$app" "$ver" "$f" "$tmp/$f" || return 1
    rm -rf "$dir" && mkdir -p "$dir"
    unzip -q "$tmp/$f" -d "$tmp/x" || return 1
    mv "$tmp"/x/*/* "$dir/" || return 1
    cli="$dir/$app-cli"
    if [ $DESKTOP = 1 ]; then
      f="$app-$ver-macos-universal.dmg"
      fetch "$app" "$ver" "$f" "$tmp/$f" || return 1
      mnt="$tmp/mnt"
      hdiutil attach -quiet -nobrowse -readonly -mountpoint "$mnt" "$tmp/$f" || return 1
      bundle=$(find "$mnt" -maxdepth 1 -name '*.app' | head -1)
      mkdir -p "$HOME/Applications"
      [ -n "$bundle" ] && rm -rf "$HOME/Applications/$(basename "$bundle")" && cp -R "$bundle" "$HOME/Applications/"
      hdiutil detach -quiet "$mnt"
      [ -n "$bundle" ] || { echo "  no .app in $f" >&2; return 1; }
      touch "$dir/DESKTOP"
    fi
  fi

  [ -x "$cli" ] || { echo "  $app-cli missing from the download" >&2; return 1; }
  ln -sf "$cli" "$BIN/$app-cli"
  echo "$ver" > "$dir/VERSION"
}

# The apps.tsv arguments for <app>, one per line, with {WS} replaced by the workspace path.
mcp_args() {
  local word
  for word in $(grep -v '^#' "$CRAFT/apps.tsv" | awk -F'\t' -v a="$1" '$1 == a {print $2}'); do
    printf '%s\n' "${word//\{WS\}/$WS}"
  done
}

json() { local s="${1//\\/\\\\}"; printf '"%s"' "${s//\"/\\\"}"; }

# craft/.mcp.json: Claude Code loads these servers whenever it is started in this folder.
write_mcp_json() {
  local app sep="" a asep
  {
    echo '{'
    echo '  "mcpServers": {'
    for app in $(grep -v '^#' "$CRAFT/apps.tsv" | cut -f1); do
      [ -x "$BIN/$app-cli" ] || continue
      printf '%s    %s: {"command": %s, "args": [' "$sep" "$(json "$app")" "$(json "$BIN/$app-cli")"
      asep=""
      while IFS= read -r a; do printf '%s%s' "$asep" "$(json "$a")"; asep=", "; done < <(mcp_args "$app")
      printf ']}'
      sep=$',\n'
    done
    printf '\n  }\n}\n'
  } > "$CRAFT/.mcp.json"
}

failed=""
for app in $(grep -v '^#' "$CRAFT/apps.tsv" | cut -f1); do
  case "$ONLY" in ""|*",$app,"*) ;; *) continue ;; esac
  install_app "$app" || failed="$failed $app"
done

write_mcp_json
echo "Wrote $CRAFT/.mcp.json"

if [ $GLOBAL = 1 ]; then
  command -v claude >/dev/null || { echo "--global needs the claude command on PATH" >&2; exit 1; }
  for app in $(grep -v '^#' "$CRAFT/apps.tsv" | cut -f1); do
    [ -x "$BIN/$app-cli" ] || continue
    args=()
    while IFS= read -r a; do args+=("$a"); done < <(mcp_args "$app")
    claude mcp remove -s user "$app" >/dev/null 2>&1 || true
    claude mcp add -s user "$app" -- "$BIN/$app-cli" "${args[@]}" >/dev/null
    echo "Registered $app with Claude Code (all folders)"
  done
fi

if [ -n "$failed" ]; then
  echo "Failed:$failed (run ./install.sh --only <app> to retry)" >&2
  exit 1
fi
echo "Done. Start Claude in $CRAFT to use the apps."
