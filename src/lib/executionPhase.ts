/** Positive evidence that this attempt failed before any signing path was entered. */
export class BeforeSigningError extends Error {}
export async function withExecutionPhase<T>(
  run: (beginSigning: () => void) => Promise<T>,
): Promise<T> {
  let signing = false;
  try {
    return await run(() => {
      signing = true;
    });
  } catch (error) {
    if (!signing)
      throw new BeforeSigningError(
        error instanceof Error ? error.message : "Falha antes da assinatura",
      );
    throw error;
  }
}
