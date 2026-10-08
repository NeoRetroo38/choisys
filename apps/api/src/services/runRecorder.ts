import type { PrismaClient } from '@prisma/client';
import type { Measurement } from '@scenarys/shared';

/** Called once when the engine reports a Run as completed. Stores only what the engine returned. */
export interface RunRecorder {
  recordCompleted(profileId: string, measurements: Measurement[]): Promise<void>;
}

export const ENGINE_VERSION = '0.1.0';
export const SCENARIO_VERSION = 'choice-grid';

export class PrismaRunRecorder implements RunRecorder {
  constructor(private readonly db: PrismaClient) {}

  async recordCompleted(profileId: string, measurements: Measurement[]): Promise<void> {
    await this.db.cubeData.create({
      data: {
        profileId, type: 'RUN', status: 'COMPLETED',
        outputData: { measurements: measurements.map(({ phase, row, column }) => ({ phase, row, column })) },
        engineVersion: ENGINE_VERSION, scenarioVersion: SCENARIO_VERSION,
      },
    });
  }
}
