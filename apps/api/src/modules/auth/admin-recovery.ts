import { randomInt } from 'node:crypto';
import * as readline from 'node:readline';

import { validatePasswordPolicy } from '@hms/shared';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

import { UNAMBIGUOUS_ALPHANUMERIC } from '../../database/seeds/seed-password';
import type { AuditRecorder } from '../audit';

import { COMMON_PASSWORDS_SET } from './data/password-blocklist.data';

export interface AdminResetOptions {
  username: string;
  force?: boolean;
  isTty?: boolean;
  prisma?: PrismaClient;
  auditRecorder?: AuditRecorder;
  promptFn?: (question: string) => Promise<string>;
}

export interface AdminResetResult {
  userId: string;
  username: string;
  temporaryPassword: string;
  version: number;
}

/**
 * Generates a cryptographically random, compliant temporary password for admin recovery.
 * Guarantees length >= 12, NFKC compliance, no username containment, no repeated runs > 3,
 * at least 6 unique characters, and absence from the Wikimedia common-password blocklist.
 */
export function generateCompliantTemporaryPassword(username: string): string {
  const symbols = '!@#$%^&*-_+=';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';

  for (let attempt = 0; attempt < 1000; attempt++) {
    const chars: string[] = [
      upper.charAt(randomInt(0, upper.length)),
      lower.charAt(randomInt(0, lower.length)),
      digits.charAt(randomInt(0, digits.length)),
      symbols.charAt(randomInt(0, symbols.length)),
    ];

    while (chars.length < 16) {
      const idx = randomInt(0, UNAMBIGUOUS_ALPHANUMERIC.length);
      chars.push(UNAMBIGUOUS_ALPHANUMERIC.charAt(idx));
    }

    // Fisher-Yates shuffle
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      const charI = chars[i];
      const charJ = chars[j];
      if (charI !== undefined && charJ !== undefined) {
        chars[i] = charJ;
        chars[j] = charI;
      }
    }

    const candidate = chars.join('');
    const validation = validatePasswordPolicy(
      candidate,
      username,
      COMMON_PASSWORDS_SET,
    );

    if (validation.valid) {
      return candidate;
    }
  }

  throw new Error(
    'Failed to generate compliant temporary password after 1000 attempts',
  );
}

/**
 * Interactively prompts the user via readline.
 */
function defaultPrompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Executes an admin password recovery reset:
 * 1. Validates TTY or --force requirement.
 * 2. In TTY mode, requires typing the exact username to confirm.
 * 3. Atomically updates password hash, bumps user version, sets must_change_password = true,
 *    and clears failed login lockout counters.
 * 4. Revokes all active sessions for the user with reason 'admin_recovery_reset'.
 * 5. Emits an audit event for the recovery action.
 * 6. Prints security warning to stderr and temporary password to stdout.
 */
export async function executeAdminPasswordReset(
  options: AdminResetOptions,
): Promise<AdminResetResult> {
  const isTty = options.isTty ?? process.stdin.isTTY;
  const force = options.force ?? false;
  const username = options.username.trim().toLowerCase();

  if (!username) {
    throw new Error('Username is required for admin password reset.');
  }

  // 1. TTY / --force safety refusal
  if (!isTty && !force) {
    throw new Error(
      'Refusing to run password reset in non-interactive environment without --force flag.',
    );
  }

  // 2. Interactive confirmation if TTY and not force
  if (isTty && !force) {
    const prompt = options.promptFn ?? defaultPrompt;
    const answer = await prompt(
      `Type '${username}' to confirm password reset for this account: `,
    );
    if (answer !== username) {
      throw new Error(
        `Confirmation mismatch (expected '${username}', received '${answer}'). Aborting.`,
      );
    }
  }

  // 3. Database connection
  const prisma = options.prisma ?? new PrismaClient();
  const shouldDisconnect = !options.prisma;

  try {
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      throw new Error(`User '${username}' not found in database.`);
    }

    // 4. Generate compliant temporary password and hash with argon2id
    const temporaryPassword = generateCompliantTemporaryPassword(username);
    const passwordHash = await argon2.hash(temporaryPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    const now = new Date();

    // 5. Transactional update: bump version, reset password, clear lockout, revoke sessions
    const updatedUser = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: true,
          failedLoginCount: 0,
          lockedUntil: null,
          passwordChangedAt: now,
          version: { increment: 1 },
        },
      });

      await tx.session.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokedReason: 'admin_recovery_reset',
        },
      });

      return u;
    });

    // 6. Record audit event
    if (options.auditRecorder) {
      await options.auditRecorder.record({
        action: 'auth.admin_recovery_reset',
        actorUserId: null,
        actorUsername: 'system:cli_recovery',
        entityType: 'user',
        entityId: user.id,
        outcome: 'success',
        metadata: {
          username: user.username,
        },
      });
    }

    return {
      userId: updatedUser.id,
      username: updatedUser.username,
      temporaryPassword,
      version: updatedUser.version,
    };
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}
