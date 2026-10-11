/*
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

export interface ConfidenceObservation {
  confidence: number;
  correct: boolean;
}

export interface ConfidenceCalibrationSummary {
  count: number;
  meanConfidence: number;
  accuracy: number;
  calibrationError: number;
}

/** Summarize confidence against observed outcomes without making policy decisions. */
export function summarizeConfidenceCalibration(
  observations: readonly ConfidenceObservation[],
): ConfidenceCalibrationSummary {
  if (observations.length === 0) {
    return { count: 0, meanConfidence: 0, accuracy: 0, calibrationError: 0 };
  }
  const meanConfidence =
    observations.reduce(
      (sum, observation) => sum + Math.min(1, Math.max(0, observation.confidence)),
      0,
    ) / observations.length;
  const accuracy =
    observations.filter((observation) => observation.correct).length / observations.length;
  return {
    count: observations.length,
    meanConfidence,
    accuracy,
    calibrationError: Math.abs(meanConfidence - accuracy),
  };
}
