import { createHash } from "crypto";
import type { ExternalComment } from "@/services/integrations/types";

export function hashComments(comments: ExternalComment[]) {
  const source = comments
    .map((comment) => `${comment.id}:${comment.createdAt}:${comment.body}`)
    .join("|");

  return createHash("sha256").update(source).digest("hex");
}
