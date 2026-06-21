import type { SplitProposal } from '../types/Refine.types.js';
import { RefineSemanticSchema } from './schemas.js';
import type { z } from 'zod';

export function splitProposalFromRefineSemantic(
  taskId: string,
  semantic: z.infer<typeof RefineSemanticSchema>,
): SplitProposal {
  return {
    originalTaskId: taskId,
    notes: semantic.rationale,
    subtasks: semantic.subtasks.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      files: subtask.files ?? [],
      rationale: semantic.rationale,
      estimatedLevel: 'LOW',
    })),
  };
}
