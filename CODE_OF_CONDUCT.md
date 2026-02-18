# PlantPulse Code of Conduct

**Clarity. Accountability. Calm Operations.**

---

## 1. Purpose and Scope

PlantPulse provides governed manufacturing scheduling and operational coordination
tools designed to support regulated production environments.

This Code of Conduct defines:

- Expected behaviors
- Ethical standards
- Governance obligations
- Data integrity principles
- Accountability requirements

It applies to:

- All employees
- Contractors
- Advisors
- Open-source contributors
- Enterprise customers operating under PlantPulse governance
- Third parties acting on behalf of PlantPulse

This Code supplements — and does not replace — applicable laws, regulatory
frameworks, and contractual obligations.

---

## 2. Our Operating Philosophy

PlantPulse is built to serve those responsible for production execution.

We recognize that:

- Manufacturing operators work nights, weekends, and holidays.
- Planners carry structural responsibility for production continuity.
- Maintenance teams coordinate high-risk interventions.
- Supervisors manage accountability in real time.

PlantPulse exists to:

- Provide one-glance operational clarity
- Preserve spatial-time cognition
- Enforce governed change
- Make ownership visible
- Reduce operational stress

All conduct within the project — code contributions, community interaction,
product decisions, and customer engagement — must align with this mission.

---

## 3. Core Principles

### 3.1 Respect for Operational Ownership

The shift ownership band represents real accountability.

All system changes must:

- Preserve clear ownership visibility
- Prevent ambiguity in responsibility
- Avoid unexpected disruption to active shifts

Operational ownership is never cosmetic. It reflects who is responsible for
production at any given moment. All contributors and users must treat it
with corresponding gravity.

### 3.2 Governed Change Is Mandatory

All plan modifications must follow formal governance:

**Draft → Propose → Approve → Commit**

Rules:

- No direct modification of committed plans
- No silent updates to active production timelines
- All commits must be attributable
- All overrides must be traceable

Unauthorized change circumvention is a violation of this Code.

### 3.3 Integrity of Records (GxP Alignment)

PlantPulse commits to electronic record integrity consistent with principles
found in:

- **21 CFR Part 11** (directional alignment)
- **EU Annex 11** (directional alignment)
- **Data integrity best practices (ALCOA+ principles)**

All records must be:

| Principle | Meaning |
|-----------|---------|
| **A**ttributable | Traceable to the person who created or modified the record |
| **L**egible | Readable and permanently so |
| **C**ontemporaneous | Recorded at the time the activity occurred |
| **O**riginal | The first-captured instance, or a verified true copy |
| **A**ccurate | Free from errors, truthful |
| **C**omplete | All data present, including any re-entries or corrections |
| **C**onsistent | Sequential, logically ordered, no unexplained gaps |
| **E**nduring | Durable for the required retention period |
| **A**vailable | Accessible for review and audit throughout the retention period |

Additional requirements:

- Audit trails must be immutable.
- Business audit trails must remain clearly separated from technical system logs.
- Deletion of audit records is prohibited.

### 3.4 Clarity Over Complexity

Features must:

- Reduce cognitive load
- Improve decision quality
- Be understandable at a glance
- Support safe execution under time pressure

Complexity that increases operational risk must be removed or redesigned.
This applies equally to code contributions: prefer clear, maintainable
solutions over clever ones.

### 3.5 Role Integrity and Segregation of Duties

Enterprise environments require separation of authority.

Minimum standards:

| Role | Permissions | Restrictions |
|------|-------------|--------------|
| **Scheduler** | Create and edit drafts | May not commit |
| **Planner** | Review, approve, commit | Full planning authority |
| **Operator** | Execute tasks, confirm checkpoints | May not alter planning structure |
| **Maintenance** | Plan maintenance layers within governance | Scoped to maintenance tasks |
| **Admin** | Configure system settings | May not bypass audit |
| **Supervisor** | Oversight, optional co-approval | As configured per deployment |

Additional controls:

- Role switching must be logged and auditable.
- Privilege escalation must be controlled and documented.
- Multi-role users retain strict per-role permission boundaries.

---

## 4. Community Standards

### 4.1 Inclusive and Professional Conduct

All participants in PlantPulse — contributors, users, customers, and
community members — are expected to:

- Treat others with respect and professionalism
- Engage constructively in technical disagreements
- Welcome newcomers and support learning
- Use inclusive language
- Respect differing viewpoints and experience levels

### 4.2 Unacceptable Behavior

The following behaviors are not tolerated:

- Harassment, intimidation, or discrimination of any kind
- Sexualized language or imagery in any project space
- Personal attacks or derogatory comments
- Public or private harassment
- Publishing others' private information without consent
- Trolling, insulting, or deliberately inflammatory remarks
- Any conduct that would be inappropriate in a professional setting

### 4.3 Ethical Conduct

All contributors must:

- Act honestly and transparently
- Avoid conflicts of interest
- Disclose potential bias in decision-making
- Report errors immediately
- Correct inaccuracies without delay

Intentional manipulation of:

- Timelines
- Audit logs
- Shift ownership
- ERP data
- Maintenance windows
- Test results or code quality metrics

constitutes serious misconduct.

---

## 5. Override Governance

Overrides may be permitted by configuration but are subject to strict controls.

When an override occurs:

1. It must be flagged automatically
2. A justification comment is mandatory
3. It must be classified by criticality
4. It must appear in the commit log
5. It must be permanently recorded in the audit trail

Critical overrides may require dual approval in enterprise configurations.

Abuse of override privileges may result in:

- Revocation of permissions
- Internal investigation
- Contractual or employment action

---

## 6. Shutdown Boundary Integrity

Plant shutdown periods are first-class operational constraints.

Rules:

- Shutdowns must be clearly displayed across all machine rows
- Active chains must not cross a shutdown boundary without explicit governance
- Restart boundaries must be deliberate and auditable
- Rotation anchors may reset only through governed action

Circumventing shutdown boundaries without approval is prohibited.

---

## 7. Data Protection and Security

PlantPulse enforces enterprise-grade security practices.

### 7.1 Identity and Access

- SSO integration (SAML/OIDC where applicable)
- MFA support
- Role-Based Access Control (RBAC)
- Segregation of duties
- Role change logging

### 7.2 Confidential Information

All users must protect:

- Production schedules
- Batch identifiers
- ERP data
- Maintenance plans
- System configuration details
- Customer data
- Security credentials and API keys

Unauthorized disclosure is prohibited. Contributors must never commit
credentials, secrets, or customer data to the repository.

### 7.3 System Integrity

System logs must capture:

- Authentication attempts
- Permission changes
- API access
- Errors
- Security-relevant events

Enterprise environments must support:

- Monitoring and alerting
- Backup procedures
- Retention policies
- Incident response documentation

---

## 8. Contribution Standards

### 8.1 Code Quality

All code contributions must:

- Follow the coding conventions defined in [CLAUDE.md](CLAUDE.md)
- Include appropriate tests
- Pass existing test suites without regression
- Maintain TypeScript strict mode compliance
- Preserve audit trail integrity in any data-handling code

### 8.2 Documentation

- User-facing changes require corresponding documentation updates
- VBA-ported logic must reference the original Sub/Function name in comments
- English for all identifiers; Slovenian terms preserved only in comments
  referencing legacy VBA originals

### 8.3 Security in Contributions

- Never commit secrets, credentials, or API keys
- Never introduce known vulnerabilities (OWASP Top 10)
- Report security concerns privately before public disclosure
- Follow responsible disclosure practices

---

## 9. Reporting Concerns

All personnel have a duty to report:

- Governance circumvention
- Data integrity concerns
- Security incidents
- Harassment or discriminatory conduct
- Role boundary violations
- Misuse of authority

### How to Report

- **Security vulnerabilities:** Report privately via email (see [SECURITY.md](SECURITY.md)
  when available, or contact the project maintainers directly)
- **Code of Conduct violations:** Contact the project maintainers at the
  repository's designated contact channels
- **Enterprise customers:** Use the escalation path defined in your service agreement

### Investigation and Protection

Reports must be:

- Investigated promptly
- Documented
- Handled without retaliation

**Retaliation against good-faith reporting is strictly prohibited** and will
be treated as an independent violation of this Code.

---

## 10. Enforcement

### 10.1 Community Enforcement

Violations of community standards (Section 4) will be addressed through:

1. **Correction** — Private notice with explanation of the violation.
   Expected outcome: a public apology if appropriate.
2. **Warning** — Formal warning with consequences for continued behavior.
   No interaction with involved parties for a specified period.
3. **Temporary Ban** — Temporary removal from community interaction and
   contribution access.
4. **Permanent Ban** — Permanent removal from the community.

### 10.2 Enterprise Enforcement

Violations within enterprise deployments may result in:

- Access restriction
- Permission removal
- Mandatory retraining
- Formal warning
- Contractual enforcement
- Termination (where applicable)
- Regulatory notification (where required)

Severity of action will align with:

- Impact on production integrity
- Data integrity risk
- Intentionality
- Recurrence

---

## 11. Training and Attestation

Enterprise implementation requires:

- Initial Code of Conduct training
- Annual refresher training
- Digital acknowledgment tracking
- Documentation retention

Role-specific training may be required for:

- Planners
- Admins
- ERP integration users
- Override-enabled roles

---

## 12. Continuous Review

This Code will be:

- Reviewed annually
- Updated based on regulatory change
- Revised following significant incidents
- Aligned with enterprise risk frameworks

Major revisions require documented approval. The revision history is
maintained in version control.

---

## 13. Commitment Statement

PlantPulse supports those who:

- Execute production under time pressure
- Work night shifts and weekends
- Carry responsibility without recognition
- Deliver products society depends on

In an uncertain world, we commit to:

- **Governed change** — no silent modifications
- **Transparent accountability** — every action attributable
- **Respect for operational ownership** — the shift band is real
- **Clear, calm operational visibility** — one-glance understanding

Compliance is not bureaucracy.
It is protection — for operators, planners, and the integrity of the
product itself.

---

## Attribution

This Code of Conduct incorporates community standards adapted from the
[Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)
and extends them with enterprise governance, GxP alignment, and
manufacturing-specific operational principles tailored to PlantPulse.

---

*Version 1.0 — February 2026*
