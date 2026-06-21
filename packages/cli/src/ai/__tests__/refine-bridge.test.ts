import { describe, it, expect } from 'vitest';
import { splitProposalFromRefineSemantic } from '../refine-bridge.js';

describe('refine ai bridge', () => {
  it('maps_semantic_subtasks_to_split_proposal', () => {
    const proposal = splitProposalFromRefineSemantic('task-100', {
      rationale: 'Task spans auth and billing',
      subtasks: [
        { id: 'task-100a', title: 'Auth slice', files: ['src/auth/login.ts'] },
        { id: 'task-100b', title: 'Billing slice', files: ['src/billing/invoice.ts'] },
      ],
    });
    expect(proposal.originalTaskId).toBe('task-100');
    expect(proposal.subtasks).toHaveLength(2);
    expect(proposal.subtasks[0]?.id).toBe('task-100a');
  });
});
