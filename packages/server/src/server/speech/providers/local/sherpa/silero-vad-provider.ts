import type { Logger } from "pino";

import type {
  TurnDetectionProvider,
  TurnDetectionSession,
} from "../../../turn-detection-provider.js";
import { SherpaSileroVadSession, type SherpaSileroVadSessionConfig } from "./silero-vad-session.js";

export class SherpaSileroTurnDetectionProvider implements TurnDetectionProvider {
  public readonly id = "local" as const;

  private readonly config: SherpaSileroVadSessionConfig;
  private readonly logger: Logger;

  constructor(config: SherpaSileroVadSessionConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({
      module: "speech",
      provider: "local",
      component: "silero-vad",
    });
  }

  createSession(params: { logger: Logger }): TurnDetectionSession {
    this.logger.debug(
      { sampleRate: this.config.sampleRate, modelPath: this.config.modelPath },
      "Creating Silero VAD turn-detection session",
    );
    return new SherpaSileroVadSession({
      logger: params.logger.child({
        provider: "local",
        component: "silero-vad-session",
      }),
      config: this.config,
    });
  }
}
