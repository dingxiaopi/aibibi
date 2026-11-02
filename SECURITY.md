# Security

Do not include secrets, complete production snapshots or personal feedback in a
public issue. Report vulnerabilities privately to the repository maintainer using
GitHub's private vulnerability reporting when enabled; otherwise request a private
contact channel without publishing exploit details or sensitive data.

Keep `.local/`, `.dev.vars`, AI API credentials and database backups private.
Use separate administrator and collector credentials. The collector credential
is for an instance owner's trusted collector, not arbitrary public submissions.
Rotate any credential that has been published, including in Git history.

Only files assembled by the public export workflow are intended for first
publication from a pre-existing private working tree. See `public-docs/release.md`.
