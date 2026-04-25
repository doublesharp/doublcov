# Multi-Language LCOV Fixture

Small static fixture for exercising Doublcov's generic LCOV path across non-Solidity languages.

The LCOV file is hand-authored to keep the fixture deterministic. It includes TypeScript, JavaScript, Rust, C, C++, and Python records with line, function, and branch coverage.

Build it locally with:

```bash
doublcov build \
  --lcov fixtures/languages/lcov.info \
  --sources fixtures/languages/src \
  --customization fixtures/languages/doublcov.config.json \
  --out coverage/languages-report
```
