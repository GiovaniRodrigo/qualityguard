CREATE TABLE IF NOT EXISTS coverage_reports (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  format TEXT NOT NULL,
  summary JSONB NOT NULL,
  files_count INTEGER NOT NULL DEFAULT 0,
  file_coverage JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coverage_reports_review_idx ON coverage_reports(review_id);
CREATE INDEX IF NOT EXISTS coverage_reports_project_idx ON coverage_reports(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coverage_reports_org_idx ON coverage_reports(organization_id);
