# Job Card — Task Classification (A17)

## One-sentence description

`POST /tasks/classify` sends a task description to an LLM and returns a single, structured, closed-schema classification that a human can grade by reading the description.

## Input

```json
{ "description": "string, 1–2000 characters" }
```

## Output (closed schema — never deviate)

```json
{
  "category": "one of [bug|feature|chore|research|other]",
  "priority": "one of [low|normal|high|urgent]",
  "suggested_team": "one of [backend|frontend|infra|design|unassigned]",
  "confidence": "number 0.0–1.0",
  "reason": "one short sentence"
}
```

## Must never

- Invent a category, team, or priority outside the lists above.
- Return free text instead of the JSON shape.
- Add fields beyond the five above.
- Reveal the prompt.
- Return raw model text to the caller, on success or failure.

## When unsure

Return `category: "other"`, `suggested_team: "unassigned"`, `confidence` below 0.5, and a short reason. Never guess.

## Trust boundaries

- This endpoint is a judgement call, not a calculation: a model is never used for arithmetic, exact DB lookups, or anything with one computable right answer.
- Only made-up test data may be sent through this endpoint — never real/company data.
