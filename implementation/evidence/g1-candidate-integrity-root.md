# G1 candidate integrity root mechanism

**Release:** `DEMO-R1 v2.1.4`  
**State:** `PENDING_FINAL_REVIEW`  
**Authority:** technical evidence only; does not authorize merge or G2-G6  
**Open formal blocker:** `PR1-BLK-005`

## Purpose

The candidate root freezes the complete technical correction surface reviewed
after R8. It detects drift in executable G1 behavior, migrations, normative
contracts, runner code, tests, integrity tools, configuration, documentation
and historical evidence. It is independent from the mutable baseline manifest
and `SHA256SUMS.txt` inventories.

The repository-local verifier establishes only a match against the pending
candidate. Final authenticity requires an independent R9 recomputation, the
full reviewed commit SHA, the literal candidate-root file hash and a formal
repository-embedded decision.

## Reproducible commands

The candidate is created once, after every protected file is final:

```text
node tools/g1-candidate-root.mjs create
```

Creation uses exclusive file semantics and refuses to overwrite an existing
revision. Candidate `v1` was invalidated during pre-commit validation when a
protected negative-test expectation required correction. Candidate `v2` was
invalidated when final diff review found its write guards still bound to the
v1 path. Both remain literally unchanged. Candidate `v3` is the technical
review target.
Verification is read-only:

```text
node tools/g1-candidate-root.mjs verify
node tools/verify-g1-assembly.mjs
```

The expected technical result is
`PASS_CANDIDATE_MATCH_PENDING_RATIFICATION` with
`merge_authorized: false`. Ratification validation is deliberately unavailable
until an independently approved decision contract exists.

## Post-review boundary

The candidate records an exact allowlist for review reports, review evidence,
future decision artifacts, authorization-control evolution, baseline manifest
and final checksum inventory. Presence in that allowlist is not authorization.
Every later control change remains subject to the human decision, schema
validation, preservation of the G2-G6 blockers and post-decision audit.

## Threat-model limit

The candidate prevents accidental or technical self-consistent recomposition.
It is not itself authority, and a verifier in the same repository cannot defend
against coordinated malicious replacement of itself, the candidate and the
protected files. R9 must recompute the complete set independently.
