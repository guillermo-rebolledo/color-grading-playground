# Issue tracker: Linear

Issues and specs live in the Memoji Inc workspace.

- Team: Memoji Inc (`MEM`)
- Team ID: `56e68145-9162-4e1e-9347-4c0ddcc65992`
- Project: color-grading-playground
- Project ID: `2ed51fb7-d69f-4eb9-b9c6-d49d5acbb265`
- Project URL: https://linear.app/memoji-inc/project/color-grading-playground-c4b6860440d5

## Conventions

Use the connected Linear tools for tracker operations.

- Publish a ticket: create a Linear issue in this team and project.
- Fetch a ticket: resolve its MEM identifier or URL and read its
  description, comments, labels, and relationships.
- List work: filter by this project, then relevant states or labels.
- Apply triage labels using `docs/agents/triage-labels.md`;
  preserve unrelated labels.
- Complete work: use the team's completed workflow state.
- Decline work: use the team's canceled workflow state and the
  `wontfix` label.

## Wayfinding

Represent a map as a parent issue labeled `wayfinder:map`.
Create child issues in this project with `wayfinder:<type>` labels.
Use native parent and blocking relationships. Select unassigned,
open children whose blockers are complete, in map order.
