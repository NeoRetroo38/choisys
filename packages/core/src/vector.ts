export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface VectorMetrics {
  magnitude: number;
  normalized: Vector3;
}

export function addVectors(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z
  };
}

export function magnitude(vector: Vector3): number {
  return Math.sqrt(
    vector.x ** 2 +
    vector.y ** 2 +
    vector.z ** 2
  );
}

export function normalize(vector: Vector3): Vector3 {
  const length = magnitude(vector);

  if (length === 0) {
    return {
      x: 0,
      y: 0,
      z: 0
    };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}

export function dot(a: Vector3, b: Vector3): number {
  return (
    a.x * b.x +
    a.y * b.y +
    a.z * b.z
  );
}

export function distance(a: Vector3, b: Vector3): number {
  return magnitude({
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z
  });
}

export function metrics(vector: Vector3): VectorMetrics {
  return {
    magnitude: magnitude(vector),
    normalized: normalize(vector)
  };
}
