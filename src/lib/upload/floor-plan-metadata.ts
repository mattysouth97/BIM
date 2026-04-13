export interface FloorPlanMetadata {
  buildingId: string;
  floors: FloorMetadataEntry[];
  uploadedAt: string; // ISO date
}

export interface FloorMetadataEntry {
  floorNumber: number;
  roomCount: number;
  totalArea: number; // m2
  useType: 'office' | 'retail' | 'residential' | 'parking' | 'mechanical';
  notes?: string;
}

const VALID_USE_TYPES = new Set<FloorMetadataEntry['useType']>([
  'office',
  'retail',
  'residential',
  'parking',
  'mechanical',
]);

export function validateFloorPlanMetadata(metadata: FloorPlanMetadata): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!metadata.buildingId || metadata.buildingId.trim() === '') {
    errors.push('buildingId is required');
  }

  if (!metadata.uploadedAt || isNaN(Date.parse(metadata.uploadedAt))) {
    errors.push('uploadedAt must be a valid ISO date string');
  }

  if (!Array.isArray(metadata.floors)) {
    errors.push('floors must be an array');
    return { valid: false, errors };
  }

  if (metadata.floors.length === 0) {
    errors.push('floors must contain at least one entry');
  }

  for (let i = 0; i < metadata.floors.length; i++) {
    const floor = metadata.floors[i];
    const prefix = `floors[${i}]`;

    if (typeof floor.floorNumber !== 'number' || !Number.isInteger(floor.floorNumber)) {
      errors.push(`${prefix}.floorNumber must be an integer`);
    }

    if (typeof floor.roomCount !== 'number' || !Number.isInteger(floor.roomCount) || floor.roomCount < 0) {
      errors.push(`${prefix}.roomCount must be a non-negative integer`);
    }

    if (typeof floor.totalArea !== 'number' || floor.totalArea <= 0) {
      errors.push(`${prefix}.totalArea must be a positive number (m2)`);
    }

    if (!VALID_USE_TYPES.has(floor.useType)) {
      errors.push(
        `${prefix}.useType must be one of: ${[...VALID_USE_TYPES].join(', ')}`
      );
    }

    if (floor.notes !== undefined && typeof floor.notes !== 'string') {
      errors.push(`${prefix}.notes must be a string if provided`);
    }
  }

  return { valid: errors.length === 0, errors };
}
