import { z } from "zod";

export const CategoryEnum = z.enum([
  "billing",
  "technical",
  "shipping",
  "refund",
  "account",
  "complaint",
  "feature_request",
  "other",
]);

export const PriorityEnum = z.enum(["P0", "P1", "P2", "P3"]);

export const TriageSchema = z.object({
  category: CategoryEnum,
  priority: PriorityEnum,
  summary: z.string().min(1, "summary must be a non-empty string"),
  suggested_action: z.string().min(1, "suggested_action must be a non-empty string"),
  needs_human: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export type TriageResult = z.infer<typeof TriageSchema>;
