# lcov-capture (C and C++)

Builder names: `lcov-capture` (aliases: `lcov`, `gcov`, `c`, `cpp`). Runs `lcov --capture` against existing `.gcda`/`.gcno` files and feeds the produced LCOV into Doublcov.

This builder does *not* compile or run your tests. Build with gcov instrumentation and execute the test binary first; `lcov-capture` only collects the resulting coverage data.

## Prerequisites

- A C/C++ compiler with gcov support (`gcc`/`g++` or `clang`)
- [`lcov`](https://github.com/linux-test-project/lcov) on `PATH`
- Node 22+ to run the Doublcov CLI

Debian/Ubuntu:

```bash
sudo apt-get install lcov
```

macOS:

```bash
brew install lcov
```

Compile and link with coverage instrumentation:

```bash
cc -O0 -g --coverage -o build/test_app src/*.c tests/*.c
./build/test_app
```

This produces `.gcno` (compile-time) and `.gcda` (run-time) files alongside the objects.

## Install

```bash
npm install --save-dev @0xdoublesharp/doublcov
```

## Quick start

After your build and test steps have produced `.gcda` files:

```bash
doublcov lcov-capture -- --rc branch_coverage=1
```

Default output: `coverage/report`.

## Passing arguments to lcov

Forward arguments after `--`:

```bash
doublcov lcov-capture -- --directory build --rc branch_coverage=1
```

## Project scripts

`Makefile`:

```make
CFLAGS += -O0 -g --coverage
LDFLAGS += --coverage

.PHONY: coverage
coverage: test
	npx doublcov lcov-capture -- --rc branch_coverage=1

.PHONY: coverage-open
coverage-open: coverage
	npx doublcov open coverage/report
```

## Manual LCOV path

```bash
lcov --capture --directory . --output-file lcov.info
doublcov build \
  --lcov lcov.info \
  --sources src,include \
  --extensions c,h,cc,hh,cpp,cxx,hpp,hxx,ipp \
  --out coverage/report
```

## CI snippet

```yaml
- run: sudo apt-get update && sudo apt-get install -y lcov
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: make test            # builds with --coverage and runs the test binary
- run: npx doublcov lcov-capture -- --rc branch_coverage=1
- uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage/report
```

## Troubleshooting

- **No `.gcda` files found.** Ensure you compiled and linked with `--coverage` and that the test binary actually ran. `.gcda` is written when the instrumented binary exits.
- **`geninfo: ERROR: no .gcda files found`.** Pass `-- --directory <build-dir>` to point `lcov` at the correct tree.
- **Out-of-tree builds.** Use `lcov --capture --directory <build> --base-directory <src>` so paths in the report resolve against your source tree.
- **clang vs gcc mismatch.** Mixing `clang` for compile and `gcov` (the gcc tool) for capture can fail; use `lcov --gcov-tool llvm-gcov` with a wrapper script when on clang.
