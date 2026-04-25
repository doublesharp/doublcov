// Belt-and-suspenders: never spawn the platform browser opener during tests.
// Individual tests can still toggle this if they need to exercise the
// non-disabled path explicitly.
process.env.DOUBLCOV_DISABLE_BROWSER_OPEN ??= "1";
