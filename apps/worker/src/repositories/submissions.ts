import type { AuthenticatedUser, GeoJsonFeature, SubmitFeatureInput } from '@yourtj/contracts';

import { ApiError } from '../utils/responses';

export type SubmissionStatus = 'pending' | 'applied' | 'rejected';

export interface Submission {
  id: string;
  submittedAt: string;
  user: string;
  count: number;
  features: GeoJsonFeature[];
  status: SubmissionStatus;
  message?: string;
  images?: SubmitFeatureInput['images'];
  reviewerId?: string;
  reviewedAt?: string;
  reviewMessage?: string;
  reviewedFeatures?: GeoJsonFeature[];
}

export type SubmissionSummary = Omit<Submission, 'features' | 'images' | 'reviewedFeatures'>;

function submissionKey(id: string) {
  return `submissions/${id}.json`;
}

async function readJson<T>(bucket: R2Bucket, key: string): Promise<T | undefined> {
  const object = await bucket.get(key);
  if (object === null) return undefined;
  return object.json<T>();
}

async function readJsonWithEtag<T>(bucket: R2Bucket, key: string): Promise<{ etag: string; value: T } | undefined> {
  const object = await bucket.get(key);
  if (object === null) return undefined;
  return { etag: object.etag, value: await object.json<T>() };
}

async function writeJson(bucket: R2Bucket, key: string, value: unknown) {
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

async function readIndex(bucket: R2Bucket) {
  return (await readJson<Record<string, SubmissionSummary>>(bucket, 'submissions/index.json')) ?? {};
}

async function updateIndex(bucket: R2Bucket, submission: Submission) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readJsonWithEtag<Record<string, SubmissionSummary>>(bucket, 'submissions/index.json');
    const index = current?.value ?? {};
    index[submission.id] = summaryOf(submission);
    const written = await bucket.put('submissions/index.json', JSON.stringify(index), {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      onlyIf: current ? { etagMatches: current.etag } : { etagDoesNotMatch: '*' },
    });
    if (written !== null) return;
  }
  throw new ApiError(409, 'SUBMISSION_INDEX_CHANGED', 'Submission index changed concurrently; retry the request');
}

function summaryOf(submission: Submission): SubmissionSummary {
  return {
    id: submission.id,
    submittedAt: submission.submittedAt,
    user: submission.user,
    count: submission.count,
    status: submission.status,
    ...(submission.message === undefined ? {} : { message: submission.message }),
    ...(submission.reviewerId === undefined ? {} : { reviewerId: submission.reviewerId }),
    ...(submission.reviewedAt === undefined ? {} : { reviewedAt: submission.reviewedAt }),
    ...(submission.reviewMessage === undefined ? {} : { reviewMessage: submission.reviewMessage }),
  };
}

async function saveSubmission(bucket: R2Bucket, submission: Submission) {
  await writeJson(bucket, submissionKey(submission.id), submission);
  await updateIndex(bucket, submission);
}

export async function createSubmission(bucket: R2Bucket, input: SubmitFeatureInput, actorId?: string) {
  const submission: Submission = {
    id: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    user: actorId ?? 'anonymous',
    count: input.features.length,
    features: input.features,
    status: 'pending',
    ...(input.message === undefined ? {} : { message: input.message }),
    ...(input.images === undefined ? {} : { images: input.images }),
  };
  await saveSubmission(bucket, submission);
  return submission;
}

export async function listPendingSubmissions(bucket: R2Bucket) {
  const index = await readIndex(bucket);
  return Object.values(index)
    .filter((submission) => submission.status === 'pending')
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
}

export async function getSubmission(bucket: R2Bucket, id: string) {
  return readJson<Submission>(bucket, submissionKey(id));
}

function featureKeys(features: GeoJsonFeature[]) {
  const occurrences = new Map<string, number>();
  return features.map((feature) => {
    if (feature.id !== undefined) return { feature, key: `id:${String(feature.id)}` };
    const content = JSON.stringify(feature);
    const occurrence = occurrences.get(content) ?? 0;
    occurrences.set(content, occurrence + 1);
    return { feature, key: `content:${content}:${occurrence}` };
  });
}

function mergeFeatures(master: GeoJsonFeature[], submitted: GeoJsonFeature[]) {
  const result = new Map<string, GeoJsonFeature>();
  for (const { feature, key } of featureKeys(master)) result.set(key, feature);
  for (const { feature, key } of featureKeys(submitted)) result.set(key, feature);
  return [...result.values()];
}

interface FeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

export async function reviewSubmission(
  bucket: R2Bucket,
  id: string,
  action: 'apply' | 'reject',
  reviewer: AuthenticatedUser,
  reviewMessage?: string,
  reviewedFeatures?: GeoJsonFeature[],
) {
  const submission = await getSubmission(bucket, id);
  if (submission === undefined) {
    throw new ApiError(404, 'SUBMISSION_NOT_FOUND', 'Submission was not found');
  }
  const targetStatus = action === 'apply' ? 'applied' : 'rejected';
  if (submission.status === targetStatus) {
    await saveSubmission(bucket, submission);
    if (targetStatus === 'applied') {
      const currentMaster = await readJson<FeatureCollection>(bucket, 'data/custom.geojson');
      return { action: targetStatus, totalFeatures: currentMaster?.features.length ?? 0 };
    }
    return { action: targetStatus };
  }
  if (submission.status !== 'pending') {
    throw new ApiError(409, 'SUBMISSION_ALREADY_REVIEWED', 'Submission has already been reviewed');
  }

  let totalFeatures: number | undefined;
  if (action === 'apply') {
    const currentMaster = await readJsonWithEtag<FeatureCollection>(bucket, 'data/custom.geojson');
    const master = currentMaster?.value ?? ({ type: 'FeatureCollection', features: [] } satisfies FeatureCollection);
    const acceptedFeatures = reviewedFeatures ?? submission.features;
    master.features = mergeFeatures(master.features, acceptedFeatures);
    totalFeatures = master.features.length;
    const written = await bucket.put('data/custom.geojson', JSON.stringify(master), {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      onlyIf: currentMaster ? { etagMatches: currentMaster.etag } : { etagDoesNotMatch: '*' },
    });
    if (written === null) throw new ApiError(409, 'MAP_DATA_CHANGED', 'Map data changed during review; retry the request');
    if (reviewedFeatures !== undefined) submission.reviewedFeatures = reviewedFeatures;
  }

  submission.status = targetStatus;
  submission.reviewerId = reviewer.id;
  submission.reviewedAt = new Date().toISOString();
  if (reviewMessage !== undefined) submission.reviewMessage = reviewMessage;
  await saveSubmission(bucket, submission);

  return totalFeatures === undefined
    ? { action: submission.status }
    : { action: submission.status, totalFeatures };
}
