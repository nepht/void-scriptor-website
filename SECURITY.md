# Security policy

## Reporting a vulnerability

Please do not publish suspected vulnerabilities, credentials, tokens, private URLs, or personal data in a public issue.

Report a suspected security issue through the private contact channel listed on the live Contact page:

- Indonesian: `https://voidscriptor.com/contact`
- English: `https://voidscriptor.com/en/contact`

Include:

- affected URL, route, or component;
- concise reproduction steps;
- expected and observed behavior;
- impact assessment;
- screenshots or logs with secrets and personal data removed.

Do not include passwords, one-time codes, API keys, signing material, `*.jks`, `android/key.properties`, session cookies, or unredacted user data. Replace sensitive values with `[REDACTED]`.

## Scope

This policy covers the public Void Scriptor website, its published Worker routes, and release metadata served from `voidscriptor.com`.

The following are not authorized test targets:

- denial-of-service or traffic flooding;
- social engineering, phishing, or credential testing;
- access to another person's account or data;
- destructive actions against production data;
- attempts to obtain or expose secrets.

Use a minimal, non-destructive proof. Stop once the issue is demonstrated.

## Release integrity

Published Windows installers include a SHA-256 manifest. A checksum demonstrates byte equality with the published artifact; it does not by itself prove publisher identity. The current release documentation describes the Windows signature status and the local verification procedure without claiming public certificate trust.

## Response expectations

Reports are reviewed as available. Please allow time for triage and remediation. We may request a sanitized reproduction or additional technical detail through the private channel.
