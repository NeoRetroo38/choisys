import type { Vector3 } from "./vector.js";
import { dot, magnitude, normalize, distance } from "./vector.js";

export interface ComparisonResult {
  cosineSimilarity: number;
  angularDistance: number;
  euclideanDistance: number;
}

export function cosineSimilarity(
  a: Vector3,
  b: Vector3
): number {
  const magnitudeA = magnitude(a);
  const magnitudeB = magnitude(b);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dot(a, b) / (magnitudeA * magnitudeB);
}

export function angularDistance(
  a: Vector3,
  b: Vector3
): number {
  const similarity = Math.max(
    -1,
    Math.min(1, cosineSimilarity(a, b))
  );

  return Math.acos(similarity);
}

export function compareVectors(
  a: Vector3,
  b: Vector3
): ComparisonResult {
  return {
    cosineSimilarity: cosineSimilarity(a, b),
    angularDistance: angularDistance(a, b),
    euclideanDistance: distance(a, b)
  };
}

export function directionalSimilarity(
  a: Vector3,
  b: Vector3
): number {
  const normalizedA = normalize(a);
  const normalizedB = normalize(b);

  return dot(normalizedA, normalizedB);
}
