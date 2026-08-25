# Security Policy

## Blix is a development-only tool

Blix is a dev-tools panel. It is gated on a literal
`process.env.NODE_ENV === "development"` check and is eliminated from
production builds by design — the panel's dynamic `import()` is dropped
entirely, and the capture layer becomes a no-op. See
[Production elimination](README.md#production-elimination) in the README for
how that works and for the call-site guard that also removes the capture
runtime from your production bundle.

This shapes what counts as a vulnerability here. A report that depends on Blix
running in production is, in the first instance, a report about a missing
`NODE_ENV` substitution in the consuming build — but tell us anyway if you
find a path by which the panel or the capture layer survives a correctly
configured production build. That would be a real bug.

## It captures credentials and personal data by nature

Blix captures full request and response bodies, headers, Redux payloads and
realtime frames, in plaintext. Header redaction covers exactly four names, and
nothing inside a body is redacted at all. This is intended behaviour, not a
defect — a debugger that hid the payload would be useless — but it has a
practical consequence:

**Treat a captured log, and any exported HAR, as a credential-bearing
artifact.** A HAR export is a plain JSON file containing decrypted request and
response bodies. Do not attach one to a public issue, do not commit one, and
purge the stored log after any session that captured an authentication flow.

[Security](README.md#security) in the README documents exactly what is
captured, what reaches disk, what is redacted, and how to purge.

## Reporting a vulnerability

For anything security-sensitive, please use a **GitHub private security
advisory** on this repository:

<https://github.com/Hakam-aldeen-Kh/blix/security/advisories/new>

That keeps the report private while it is being worked on. Please include the
affected version, what you observed, and the steps to reproduce it.

For non-sensitive reports — a documentation error about security behaviour, a
hardening suggestion, anything that does not need to stay private — the
[issue tracker](https://github.com/Hakam-aldeen-Kh/blix/issues) is fine and is
easier to discuss in the open.

## Supported versions

Only the latest minor version receives security fixes. Older minors are not
backported; upgrade to the current release.
