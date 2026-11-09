# GitHub approval record pilot

Status: Proposed checker contract. The checker is read-only and has no live GitHub trigger.

Create one GitHub issue per change set. Its body must contain the full proposed
contents for new files, unified diffs for existing files, purpose, dependencies,
risks, and validation. Add exactly one fenced governance-record JSON block
using tilde fences:

~~~governance-record
{
  "record_version": 1,
  "change_id": "unique-id",
  "project": "stevieceejay/Move-Learner",
  "baseline_sha": "40-or-64-character Git commit SHA",
  "files": [
    {
      "path": "relative/path",
      "status": "added | modified | removed | renamed",
      "sha": "Git blob SHA of the resulting file, or null when removed"
    }
  ],
  "actions": [],
  "approved_attention_at": "UTC ISO timestamp"
}
~~~

For a renamed file, also provide previous_filename. The proposed file content
or diff must be reviewable in the issue body. The recorded blob SHA must match
the proposed resulting file. This pilot checker does not independently verify
that the issue's displayed content or diff produces the recorded SHA.

After review, the authorized owner posts one exact comment:
APPROVE sha256:<digest of the complete current issue body>

The digest is lowercase SHA-256 of the issue body as GitHub returns it. The
checker rejects an edited approval comment, another author's comment, and a
proposal body changed after approval. The checker does not treat chat approval
or silence as a GitHub approval.

Input to checkApproval is a trusted adapter's snapshot of the issue body,
GitHub comment user IDs/timestamps, repository ID, PR base SHA, and the complete
paginated PR file list. A future GitHub event adapter must fetch those values
from GitHub; untrusted issue text cannot supply repository or approver identity.
The code checks paths, operations, and resulting Git blob SHAs. Non-file actions
require separate evidence and review.

The output is advisory. MATCHED means only that the supplied snapshot matches
this record; it does not prove that local edits occurred after approval or that
commands outside GitHub were authorized. No agent, webhook, notification, or
deployment is activated by this change.
