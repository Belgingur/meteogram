# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities.

Instead, report it privately through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability):
go to the **Security** tab of this repository and choose **Report a
vulnerability**. This opens a private advisory visible only to the maintainers.

Please include enough detail to reproduce the issue (affected version, a
minimal example, and the impact you observed). We will acknowledge the report
and keep you updated on the fix.

## Scope

`bel-meteogram` is a client-side rendering widget with no runtime dependencies.
It fetches forecast data from a host-configured API and renders it; it does not
handle secrets itself. Reports about the data API belong with the operator of
that API, not this repository.
