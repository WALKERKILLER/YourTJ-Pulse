import type { AuthenticatedUser, GeoJsonFeature } from '@yourtj/contracts';

import { hasElevatedRole, writeAudit } from './business';

interface FeatureRevisionRow {
  id: string;
  submission_id: string | null;
  feature_id: string;
  author_id: string;
  author_name: string;
  base_version: number;
  operation: 'create' | 'update' | 'delete';
  payload_json: string;
  status: 'pending' | 'applied' | 'rejected';
  reviewer_id: string | null;
  review_message: string | null;
  created_at: string;
  reviewed_at: string | null;
}

function revisionFromRow(row: FeatureRevisionRow) {
  return {
    id: row.id,
    submissionId: row.submission_id,
    featureId: row.feature_id,
    authorId: row.author_id,
    authorName: row.author_name,
    baseVersion: row.base_version,
    operation: row.operation,
    payload: JSON.parse(row.payload_json) as GeoJsonFeature,
    status: row.status,
    reviewerId: row.reviewer_id,
    reviewMessage: row.review_message,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

function featureVersion(feature: GeoJsonFeature): number {
  const value = feature.properties?.version;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

export async function recordSubmissionFeatureRevisions(
  db: D1Database,
  user: AuthenticatedUser,
  submissionId: string,
  features: GeoJsonFeature[],
): Promise<void> {
  const timestamp = new Date().toISOString();
  const statements = features.map((feature, index) => {
    const featureId = feature.id === undefined ? `new:${submissionId}:${index}` : String(feature.id);
    return db.prepare(
      `INSERT INTO feature_revisions (
         id, submission_id, feature_id, author_id, base_version, operation,
         payload_json, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    ).bind(
      `${submissionId}:${index}`,
      submissionId,
      featureId,
      user.id,
      featureVersion(feature),
      feature.id === undefined ? 'create' : 'update',
      JSON.stringify(feature),
      timestamp,
    );
  });
  statements.push(db.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata_json, created_at)
     VALUES (?, ?, 'feature_revision.submit', 'submission', ?, ?, ?)`,
  ).bind(crypto.randomUUID(), user.id, submissionId, JSON.stringify({ count: features.length }), timestamp));
  await db.batch(statements);
}

export async function finalizeSubmissionFeatureRevisions(
  db: D1Database,
  submissionId: string,
  reviewer: AuthenticatedUser,
  action: 'apply' | 'reject',
  reviewMessage?: string,
): Promise<number> {
  const timestamp = new Date().toISOString();
  const result = await db.prepare(
    `UPDATE feature_revisions
     SET status = ?, reviewer_id = ?, review_message = ?, reviewed_at = ?
     WHERE submission_id = ? AND status = 'pending'`,
  ).bind(action === 'apply' ? 'applied' : 'rejected', reviewer.id, reviewMessage ?? null, timestamp, submissionId).run();
  if (result.meta.changes > 0) {
    await writeAudit(db, reviewer.id, `feature_revision.${action}`, 'submission', submissionId, {
      count: result.meta.changes,
    });
  }
  return result.meta.changes;
}

export async function listFeatureRevisions(
  db: D1Database,
  user: AuthenticatedUser,
  submissionId?: string,
) {
  const conditions: string[] = [];
  const values: string[] = [];
  if (!hasElevatedRole(user)) {
    conditions.push('fr.author_id = ?');
    values.push(user.id);
  }
  if (submissionId) {
    conditions.push('fr.submission_id = ?');
    values.push(submissionId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await db.prepare(
    `SELECT fr.*, u.display_name AS author_name
     FROM feature_revisions fr JOIN users u ON u.id = fr.author_id
     ${where} ORDER BY fr.created_at DESC, fr.id ASC LIMIT 500`,
  ).bind(...values).all<FeatureRevisionRow>();
  return result.results.map(revisionFromRow);
}
