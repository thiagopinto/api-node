import { type Request, type Response, type NextFunction } from "express";
import { type Server } from "node:http";

// Estado Global de processo
let inFlightRequests = 0;
let isShuttingDown = false;

/**
 * Middleware that tracks active ("in-flight") requests
 */
export function inFlightMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // If the server has already initiated the shutdown process, we reject new requests
  if (isShuttingDown) {
    res.setHeader("Connection", "close");
    return res.status(503).json({
      error: "Service Unavailable",
      message: "The server is shutting down and is not accepting new requests.",
    });
  }

  // Increment riquest i inFlight
  inFlightRequests++;
  let cleanedUp = false;
  const decrement = () => {
    if (!cleanedUp) {
      cleanedUp = true;
      inFlightRequests--;
    }
  };

  // 'finish' fires when the response has been successfully sent
  // 'close' fires if the client connection drops before the response is complete
  res.on("finish", decrement);
  res.on("close", decrement);

  next();
}

/**
 * Return total requests in flight
 */
export function getInFlightCount(): number {
  return inFlightRequests;
}

/**
 * Configures graceful shutdown
 * @param server Instance of the Express HTTP server
 * @param timeoutMs Maximum time to wait before forcing a shutdown (e.g., 10s)
 */
export function setupGracefulShutdown(server: Server, timeoutMs = 10000) {
  const shutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n🔴 Signal received: ${signal}, starting graceful shutdown...`);

    // 1. Stop accepting new connections
    server.close((error) => {
      if (error) {
        console.error("🔴 Error closing server:", error);
        process.exit(1);
      }
      console.log("🔴 All connections closed, exiting now.");
      //process.exit(0);
    });


    // 2. Safety timeout: if any request hangs, force termination
    const forceTimeout = setTimeout(() => {
      console.error(`🔴 Timeout ${timeoutMs}ms reached. Graceful shutdown timed out, forcing exit.`);
      process.exit(1);
    }, timeoutMs);

    // Prevents this timer from keeping the process alive on its own
    forceTimeout.unref();

    // 3. Verification loop: checks every 200ms whether the in-flight requests have reached zero
    const checkInterval = setInterval(() => {
      console.log(`🔴 Checking in-flight requests: ${inFlightRequests}`);

      if (inFlightRequests === 0) {
        clearInterval(checkInterval);
        clearTimeout(forceTimeout);
        console.log("🔴 All in-flight requests completed.");
        process.exit(0);
      }
    }, 200);

  };

  // Listen for termination signals
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
