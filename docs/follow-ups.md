# Follow-ups

Today has a **Follow up** section for work that has waited longer than it
should. The client workspace shows the same items for that client under
"What's next". An item that is a follow-up is listed there only, not again
under "Needs your decision" or "Next up".

Follow-ups are computed from the data on every render
(`getFollowUps` in `src/lib/domain/followups.ts`). Nothing is stored, nothing
is changed and nothing is sent, so there is nothing extra to anonymise.

## Rules

| Follow-up | When | Measured from |
| --------- | ---- | ------------- |
| Website inquiry not decided | 2 working days | Received |
| Task awaiting approval | 2 working days | Task last changed |
| Task in review | 2 working days | Task last changed |
| Task blocked | 3 days | Task last changed |
| Onboarding saved but not finished | 5 days | Onboarding last saved |
| Brief never started (no onboarding, essentials missing) | 5 days | Client last changed |
| Brief ready, no project | 3 days | Onboarding finished |
| Active project with no activity | 10 days | Latest person-made event, task change or project change |

Thresholds live in `FOLLOW_UP_RULES`. Working days are Monday to Friday in
Helsinki; public holidays are not skipped. Archived and paused clients, and
tasks in completed or paused projects, never produce follow-ups. A project
whose tasks are already waiting is not listed as quiet as well.

For a quiet project, only events made by a person count. Agent and system
events never keep a project "alive". The same rule applies to client activity
for retention; the quiet-client follow-ups planned next reuse that one
definition instead of adding another.
