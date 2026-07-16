import { z } from 'zod';

import { API_LIMITS } from './limits';

const longitudeSchema = z.number().finite().min(-180).max(180);
const latitudeSchema = z.number().finite().min(-90).max(90);

export const positionSchema = z.union([
  z.tuple([longitudeSchema, latitudeSchema]),
  z.tuple([longitudeSchema, latitudeSchema, z.number().finite()]),
]);

const pointGeometrySchema = z
  .object({
    type: z.literal('Point'),
    coordinates: positionSchema,
  })
  .strict();

const multiPointGeometrySchema = z
  .object({
    type: z.literal('MultiPoint'),
    coordinates: z.array(positionSchema).min(1),
  })
  .strict();

const lineStringCoordinatesSchema = z.array(positionSchema).min(2);

const lineStringGeometrySchema = z
  .object({
    type: z.literal('LineString'),
    coordinates: lineStringCoordinatesSchema,
  })
  .strict();

const multiLineStringGeometrySchema = z
  .object({
    type: z.literal('MultiLineString'),
    coordinates: z.array(lineStringCoordinatesSchema).min(1),
  })
  .strict();

const linearRingSchema = z.array(positionSchema).min(4).superRefine((ring, context) => {
  const first = ring[0];
  const last = ring.at(-1);
  if (first?.[0] !== last?.[0] || first?.[1] !== last?.[1]) {
    context.addIssue({
      code: 'custom',
      message: 'Polygon rings must be closed',
    });
  }
});

const polygonCoordinatesSchema = z.array(linearRingSchema).min(1);

const polygonGeometrySchema = z
  .object({
    type: z.literal('Polygon'),
    coordinates: polygonCoordinatesSchema,
  })
  .strict();

const multiPolygonGeometrySchema = z
  .object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(polygonCoordinatesSchema).min(1),
  })
  .strict();

export const geometrySchema = z.discriminatedUnion('type', [
  pointGeometrySchema,
  multiPointGeometrySchema,
  lineStringGeometrySchema,
  multiLineStringGeometrySchema,
  polygonGeometrySchema,
  multiPolygonGeometrySchema,
]);

const propertyValueSchema = z.union([
  z.string().max(API_LIMITS.propertyStringCharacters),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const propertiesSchema = z
  .record(z.string().min(1).max(API_LIMITS.propertyKeyCharacters), propertyValueSchema)
  .superRefine((properties, context) => {
    if (Object.keys(properties).length > API_LIMITS.propertyCount) {
      context.addIssue({
        code: 'too_big',
        origin: 'object',
        maximum: API_LIMITS.propertyCount,
        inclusive: true,
        message: `At most ${API_LIMITS.propertyCount} properties are allowed`,
      });
    }
  });

export const featureSchema = z
  .object({
    type: z.literal('Feature'),
    id: z.union([z.string().min(1).max(200), z.number().finite()]).optional(),
    geometry: geometrySchema,
    properties: propertiesSchema.nullable().optional(),
  })
  .strict();

export const imageReferenceSchema = z
  .object({
    url: z.url().max(2_048),
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    sizeBytes: z.number().int().positive().max(API_LIMITS.imageBytes),
  })
  .strict();

export const submitFeatureSchema = z
  .object({
    features: z.array(featureSchema).min(1).max(API_LIMITS.featuresPerSubmission),
    message: z.string().trim().max(API_LIMITS.messageCharacters).optional(),
    user: z.string().trim().min(1).max(100).optional(),
    images: z.array(imageReferenceSchema).max(API_LIMITS.imagesPerSubmission).optional(),
  })
  .strict();

export type GeoJsonPosition = z.infer<typeof positionSchema>;
export type GeoJsonGeometry = z.infer<typeof geometrySchema>;
export type GeoJsonFeature = z.infer<typeof featureSchema>;
export type ImageReference = z.infer<typeof imageReferenceSchema>;
export type SubmitFeatureInput = z.infer<typeof submitFeatureSchema>;
