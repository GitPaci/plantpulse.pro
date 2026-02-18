# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in PlantPulse Scheduler, please report it responsibly. **Do not open a public GitHub issue for security vulnerabilities.**

### How to Report

1. **Email:** Send a detailed report to [hello@plantpulse.pro](mailto:hello@plantpulse.pro).
2. **GitHub Private Vulnerability Reporting:** If enabled, use GitHub's [private vulnerability reporting](https://github.com/GitPaci/plantpulse.pro/security/advisories/new) feature to submit your report directly.

### What to Include

- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- Affected versions or components
- Any suggested fixes or mitigations (if available)

### What to Expect

- **Acknowledgment:** We will acknowledge receipt of your report within 72 hours.
- **Assessment:** We will investigate and assess the severity of the vulnerability.
- **Updates:** We will provide status updates as we work on a fix.
- **Resolution:** Once a fix is available, we will release a patch and publicly disclose the vulnerability with credit to the reporter (unless anonymity is requested).

## Security Considerations

PlantPulse Scheduler is a browser-based manufacturing planning tool. Key security aspects:

- **Free Edition** runs entirely client-side with no server component — schedule data stays in the user's browser and local files.
- **Excel import/export** parses user-provided `.xlsx` files. Input validation is applied to prevent malformed data from affecting application state.
- **No authentication** is required for the Free Edition. Enterprise editions will include role-based access control and audit logging.

## Best Practices for Users

- Keep your browser up to date.
- Do not import Excel files from untrusted sources without reviewing their contents.
- When using the Enterprise Edition, follow your organization's access control and credential management policies.
