#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
if [ "$(uname -s)" != Darwin ]; then
  echo 'macOS desktop builds require macOS and Xcode Command Line Tools.' >&2
  exit 1
fi

arch=${ARCH:-$(go env GOARCH)}
case "$arch" in arm64|amd64|universal) ;; *) echo "Unsupported ARCH: $arch" >&2; exit 1 ;; esac

bundle=bin/Famo.app
mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources"
cp build/macos/Info.plist "$bundle/Contents/Info.plist"
cp build/macos/famo.icns "$bundle/Contents/Resources/famo.icns"

export CGO_ENABLED=1 MACOSX_DEPLOYMENT_TARGET=13.3
export CGO_CFLAGS="${CGO_CFLAGS:-} -mmacosx-version-min=13.3"
export CGO_LDFLAGS="${CGO_LDFLAGS:-} -mmacosx-version-min=13.3"
# Some CLT installations leave SDK header symlinks here. Treat them as system
# headers so clang does not turn SDK nullability warnings into cgo errors.
if [ -L /usr/local/include/stdlib.h ]; then
  export CGO_CPPFLAGS="${CGO_CPPFLAGS:-} -isystem /usr/local/include"
fi
tags="production${EXTRA_TAGS:+,$EXTRA_TAGS}"
build_binary() {
  GOARCH="$1" go build -tags "$tags" -trimpath -ldflags='-s -w' -o "$2" ./cmd/famo-desktop
}
if [ "$arch" = universal ]; then
  build_binary arm64 bin/famo-desktop-arm64
  build_binary amd64 bin/famo-desktop-amd64
  lipo -create bin/famo-desktop-arm64 bin/famo-desktop-amd64 -output "$bundle/Contents/MacOS/famo-desktop"
  rm bin/famo-desktop-arm64 bin/famo-desktop-amd64
else
  build_binary "$arch" "$bundle/Contents/MacOS/famo-desktop"
fi
codesign --force --sign - "$bundle"
codesign --verify --strict "$bundle"
echo "Built $bundle ($arch)"
