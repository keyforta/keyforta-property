# EDD trust bootstrap (retired)

The custom Trusted EDD workflow, hash manifest, source binding, and exact-head
approval-comment rotation protocol were retired by issue #28. They duplicated
GitHub's pull-request review role and imposed coordination cost that did not
scale with the development team.

Normal CI continues to validate the checked-out pull-request revision with the
canonical repository verifier and generate EDD evidence. The EDD validator does
not bind descriptive commit or branch metadata to the checkout. GitHub required
checks, pull-request reviews, CODEOWNERS or rulesets, branch protection, and
merge controls remain authoritative; repository task or evidence records cannot
approve or merge a pull request.

GitHub currently reports zero required approvals for this private repository.
Until branch protection or rulesets can enforce reviews, approval remains a
voluntary human merge policy. This accepted limitation is recorded in
`docs/engineering/REQUIREMENTS_GAPS.md`.

Reverting the retirement commit restores the historical mechanism. Reintroducing
an additional verifier requires a new approved issue, a measured need, and an
independent review of its operational cost.
