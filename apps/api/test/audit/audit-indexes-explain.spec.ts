import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { cleanTestDatabase } from '../utils/test-cleaner';

interface PlanNode {
  'Node Type'?: string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

interface ExplainWrapper {
  'QUERY PLAN': [{ Plan: PlanNode }];
}

function findIndexInPlan(plan: PlanNode, expectedIndexName: string): boolean {
  if (plan['Index Name'] === expectedIndexName) {
    return true;
  }
  if (plan.Plans && plan.Plans.length > 0) {
    return plan.Plans.some((child) =>
      findIndexInPlan(child, expectedIndexName),
    );
  }
  return false;
}

describe('Audit Log Database Indexes & EXPLAIN Verification', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    await cleanTestDatabase();
    prisma = new PrismaClient(
      process.env.DATABASE_URL
        ? { datasources: { db: { url: process.env.DATABASE_URL } } }
        : undefined,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('verifies index 1: audit_log_occurred_at_id_idx is used for default pagination order', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL enable_seqscan = OFF;`);
      const rawResult = await tx.$queryRawUnsafe<ExplainWrapper[]>(`
        EXPLAIN (FORMAT JSON)
        SELECT * FROM "audit_log"
        ORDER BY "occurred_at" DESC, "id" DESC
        LIMIT 25;
      `);

      const plan = rawResult[0]?.['QUERY PLAN']?.[0]?.Plan;
      expect(plan).toBeDefined();
      if (!plan) {
        throw new Error('Expected query plan to be defined');
      }
      expect(findIndexInPlan(plan, 'audit_log_occurred_at_id_idx')).toBe(true);
    });
  });

  it('verifies index 2: audit_log_patient_id_occurred_at_idx is used for patient timeline queries', async () => {
    const fakePatientId = randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL enable_seqscan = OFF;`);
      const rawResult = await tx.$queryRawUnsafe<ExplainWrapper[]>(`
        EXPLAIN (FORMAT JSON)
        SELECT * FROM "audit_log"
        WHERE "patient_id" = '${fakePatientId}'::uuid
        ORDER BY "occurred_at" DESC
        LIMIT 25;
      `);

      const plan = rawResult[0]?.['QUERY PLAN']?.[0]?.Plan;
      expect(plan).toBeDefined();
      if (!plan) {
        throw new Error('Expected query plan to be defined');
      }
      expect(
        findIndexInPlan(plan, 'audit_log_patient_id_occurred_at_idx'),
      ).toBe(true);
    });
  });

  it('verifies index 3: audit_log_actor_user_id_occurred_at_idx is used for actor activity queries', async () => {
    const fakeActorId = randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL enable_seqscan = OFF;`);
      const rawResult = await tx.$queryRawUnsafe<ExplainWrapper[]>(`
        EXPLAIN (FORMAT JSON)
        SELECT * FROM "audit_log"
        WHERE "actor_user_id" = '${fakeActorId}'::uuid
        ORDER BY "occurred_at" DESC
        LIMIT 25;
      `);

      const plan = rawResult[0]?.['QUERY PLAN']?.[0]?.Plan;
      expect(plan).toBeDefined();
      if (!plan) {
        throw new Error('Expected query plan to be defined');
      }
      expect(
        findIndexInPlan(plan, 'audit_log_actor_user_id_occurred_at_idx'),
      ).toBe(true);
    });
  });

  it('verifies index 4: audit_log_entity_idx is used for entity lifecycle history queries', async () => {
    const fakeEntityId = randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL enable_seqscan = OFF;`);
      const rawResult = await tx.$queryRawUnsafe<ExplainWrapper[]>(`
        EXPLAIN (FORMAT JSON)
        SELECT * FROM "audit_log"
        WHERE "entity_type" = 'user' AND "entity_id" = '${fakeEntityId}';
      `);

      const plan = rawResult[0]?.['QUERY PLAN']?.[0]?.Plan;
      expect(plan).toBeDefined();
      if (!plan) {
        throw new Error('Expected query plan to be defined');
      }
      expect(findIndexInPlan(plan, 'audit_log_entity_idx')).toBe(true);
    });
  });

  it('verifies index 5: audit_log_action_occurred_at_idx is used for action-filtered timeline queries', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL enable_seqscan = OFF;`);
      const rawResult = await tx.$queryRawUnsafe<ExplainWrapper[]>(`
        EXPLAIN (FORMAT JSON)
        SELECT * FROM "audit_log"
        WHERE "action" = 'auth.login_failed'
        ORDER BY "occurred_at" DESC
        LIMIT 25;
      `);

      const plan = rawResult[0]?.['QUERY PLAN']?.[0]?.Plan;
      expect(plan).toBeDefined();
      if (!plan) {
        throw new Error('Expected query plan to be defined');
      }
      expect(findIndexInPlan(plan, 'audit_log_action_occurred_at_idx')).toBe(
        true,
      );
    });
  });

  it('verifies index 6: audit_log_request_id_idx is used for request-correlation queries', async () => {
    const fakeRequestId = 'req-123456';
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL enable_seqscan = OFF;`);
      const rawResult = await tx.$queryRawUnsafe<ExplainWrapper[]>(`
        EXPLAIN (FORMAT JSON)
        SELECT * FROM "audit_log"
        WHERE "request_id" = '${fakeRequestId}';
      `);

      const plan = rawResult[0]?.['QUERY PLAN']?.[0]?.Plan;
      expect(plan).toBeDefined();
      if (!plan) {
        throw new Error('Expected query plan to be defined');
      }
      expect(findIndexInPlan(plan, 'audit_log_request_id_idx')).toBe(true);
    });
  });
});
