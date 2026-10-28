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
  /** Mean squared error of the stated confidences against realized outcomes. */
  brierScore: number;
}

/**
 * Phase 3 (Jev roadmap) — Brier score `mean((confidence − outcome)²)` where a
 * correct call is `1` and an incorrect call is `0`. Lower is better: `0` is a
 * perfectly calibrated oracle, `0.25` is the score of a constant `0.5` guess.
 * An empty observation set has no error to report and returns `0`.
 */
export function computeBrierScore(observations: readonly ConfidenceObservation[]): number {
  if (observations.length === 0) return 0;
  const total = observations.reduce((sum, observation) => {
    const confidence = Math.min(1, Math.max(0, observation.confidence));
    const outcome = observation.correct ? 1 : 0;
    return sum + (confidence - outcome) ** 2;
  }, 0);
  return total / observations.length;
}

/** Summarize confidence against observed outcomes without making policy decisions. */
export function summarizeConfidenceCalibration(
  observations: readonly ConfidenceObservation[],
): ConfidenceCalibrationSummary {
  if (observations.length === 0) {
    return { count: 0, meanConfidence: 0, accuracy: 0, calibrationError: 0, brierScore: 0 };
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
    brierScore: computeBrierScore(observations),
  };
}
