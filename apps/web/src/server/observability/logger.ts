import pino, {
  type DestinationStream,
  type Logger as PinoLogger,
  type LoggerOptions,
} from "pino";
import {
  forbiddenLogFields,
  sanitizeLogEvent,
  type SafeLogEvent,
  type UnsafeLogEvent,
} from "./redaction.js";

export type AppEnvironment = "local" | "test" | "production";

export interface ApplicationLogger {
  info(event: UnsafeLogEvent): SafeLogEvent;
  error(event: UnsafeLogEvent): SafeLogEvent;
}

export function usesPrettyOutput(environment: AppEnvironment) {
  return environment === "local";
}

function createPinoLogger(
  environment: AppEnvironment,
  destination?: DestinationStream,
): PinoLogger {
  const options: LoggerOptions = {
    base: undefined,
    formatters: {
      level: (label) => ({ level: label }),
    },
    level: "info",
    redact: {
      paths: [...forbiddenLogFields],
      censor: "[REDACTED]",
      remove: true,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (destination) {
    return pino(options, destination);
  }
  if (usesPrettyOutput(environment)) {
    return pino(
      options,
      pino.transport({
        target: "pino-pretty",
        options: { colorize: true, singleLine: true },
      }),
    );
  }
  return pino(options);
}

export function createApplicationLogger({
  environment = "production",
  destination,
}: {
  environment?: AppEnvironment;
  destination?: DestinationStream;
} = {}): ApplicationLogger {
  const logger = createPinoLogger(environment, destination);

  return {
    info(input) {
      const event = sanitizeLogEvent(input);
      logger.info(event);
      return event;
    },
    error(input) {
      const event = sanitizeLogEvent(input);
      logger.error(event);
      return event;
    },
  };
}
