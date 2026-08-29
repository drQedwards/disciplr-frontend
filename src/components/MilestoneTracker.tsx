import { AlertTriangle, Loader2 } from "lucide-react";
import { Text } from "./Text";
import { SafeLink } from "./SafeLink";
import { EmptyState } from "./EmptyState";
import type { Milestone, MilestoneStatus } from "../types/vault";
import { analyzeMilestones } from "../utils/vaultState";
import "./MilestoneTracker.css";

export type { Milestone };

export interface MilestoneTrackerProps {
  milestones: Milestone[];
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  canManage?: boolean;
  onManageMilestone?: (milestone: Milestone) => void;
}

/**
 * Explicit rendering bounds for the milestone tracker.
 *
 * These constants define the feature's invariants for adversarial inputs:
 * - `MAX_MILESTONES_RENDERED` caps DOM nodes and layout cost.
 * - Text-length bounds prevent unbounded string rendering from hostile data.
 * - `MAX_EVIDENCE_URL_LENGTH` bounds the URL we hand to SafeLink.
 */
export const MAX_MILESTONES_RENDERED = 50;
export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_CRITERIA_LENGTH = 500;
export const MAX_EVIDENCE_URL_LENGTH = 2048;

const MILESTONE_STATUS_CONFIG: Record<
  MilestoneStatus,
  { label: string; className: string }
> = {
  pending: { label: "Pending", className: "is-pending" },
  validated: { label: "Validated", className: "is-validated" },
  failed: { label: "Failed", className: "is-failed" },
};

const UNKNOWN_STATUS_CONFIG = { label: "Unknown status", className: "is-invalid" };

function formatValidatedAt(iso: string): string {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return "Unknown";
  }
  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clip(value: string | undefined, max: number): string {
  if (typeof value !== "string") return "";
  return value.length > max ? value.slice(0, max) : value;
}

function checkInvariants(milestones: Milestone[]): Error | null {
  for (const m of milestones) {
    if (m.status === "validated" && m.validatedAt == null) {
      return new Error(`Milestone '${m.id}' is validated but missing validatedAt timestamp.`);
    }
    if (m.status !== "validated" && m.validatedAt) {
      return new Error(`Milestone '${m.id}' is ${m.status} but contains validation evidence.`);
    }
  }

  const startsBlocked =
    milestones[0]?.status === "pending" || milestones[0]?.status === "failed";
  if (startsBlocked) {
    const later = milestones.find((m, i) => i > 0 && m.status === "validated");
    if (later) {
      return new Error(
        `Impossible transition: validated milestone '${later.id}' appears after a pending or failed milestone.`,
      );
    }
  }
  return null;
}

export function MilestoneTracker({
  milestones,
  isLoading,
  error,
  onRetry,
  canManage,
  onManageMilestone,
}: MilestoneTrackerProps) {
  if (isLoading) {
    return (
      <div className="milestone-tracker-loading" aria-busy="true" aria-live="polite">
        <Loader2 className="milestone-tracker-spinner" aria-hidden="true" size={24} />
        <Text role="body" as="p">Loading milestones...</Text>
      </div>
    );
  }

  const boundedMilestones = milestones.slice(0, MAX_MILESTONES_RENDERED);
  const invariantError = checkInvariants(boundedMilestones);
  const activeError = error || invariantError;

  if (activeError) {
    return (
      <div className="milestone-tracker-error" role="alert" aria-live="assertive">
        <EmptyState
          icon={<AlertTriangle size={32} style={{ color: "var(--danger, red)" }} />}
          title="Cannot load milestones"
          description={activeError.message}
          action={onRetry ? { label: "Retry", onClick: onRetry } : undefined}
        />
      </div>
    );
  }

  if (boundedMilestones.length === 0) {
    return (
      <Text
        role="body"
        as="p"
        className="milestone-tracker-empty"
        aria-live="polite"
      >
        No milestones have been defined for this vault.
      </Text>
    );
  }

  const { currentIndex, anomalies } = analyzeMilestones(boundedMilestones);

  return (
    <>
      {anomalies.length > 0 && (
        <div
          role="status"
          className="milestone-tracker-anomalies"
          aria-label="Milestone data inconsistency notice"
        >
          <Text role="caption" as="p" className="milestone-tracker-anomaly-title">
            Milestone progress contains inconsistent data:
          </Text>
          <ul className="milestone-tracker-anomaly-list">
            {anomalies.map((anomaly) => (
              <li key={`${anomaly.kind}-${anomaly.index}`}>{anomaly.message}</li>
            ))}
          </ul>
        </div>
      )}
      <ol className="milestone-tracker" aria-label="Vault milestone progress">
        {boundedMilestones.map((milestone, index) => {
          const status =
            MILESTONE_STATUS_CONFIG[milestone.status] ?? UNKNOWN_STATUS_CONFIG;
          const isCurrent = index === currentIndex;
          const validatedAt =
            typeof milestone.validatedAt === "string" &&
            milestone.validatedAt.trim().length > 0
              ? milestone.validatedAt
              : undefined;
          const evidenceUrl =
            typeof milestone.evidenceUrl === "string"
              ? clip(milestone.evidenceUrl, MAX_EVIDENCE_URL_LENGTH)
              : undefined;

          return (
            <li
              key={`${milestone.id ?? ""}-${index}`}
              className={`milestone-tracker-step ${status.className}`}
              aria-current={isCurrent ? "step" : undefined}
            >
              <div className="milestone-tracker-marker" aria-hidden="true">
                {index + 1}
              </div>
              <div className="milestone-tracker-content">
                <div className="milestone-tracker-header">
                  <Text role="body" as="h3" className="milestone-tracker-title">
                    {clip(milestone.title, MAX_TITLE_LENGTH)}
                  </Text>
                  <span className="milestone-tracker-badge">{status.label}</span>
                </div>

                <Text role="caption" as="p" className="milestone-tracker-copy">
                  {clip(milestone.description, MAX_DESCRIPTION_LENGTH)}
                </Text>
                <Text role="caption" as="p" className="milestone-tracker-copy">
                  <strong>Criteria:</strong> {clip(milestone.criteria, MAX_CRITERIA_LENGTH)}
                </Text>

                <div className="milestone-tracker-meta">
                  {validatedAt && (
                    <Text
                      role="caption"
                      as="span"
                      className="milestone-tracker-validated-at"
                    >
                      Validated {formatValidatedAt(validatedAt)}
                    </Text>
                  )}
                  {evidenceUrl && (
                    <SafeLink
                      className="milestone-tracker-evidence"
                      href={evidenceUrl}
                    >
                      View evidence
                    </SafeLink>
                  )}
                  {canManage && isCurrent && onManageMilestone && (
                    <button
                      type="button"
                      className="milestone-tracker-manage"
                      onClick={() => onManageMilestone(milestone)}
                    >
                      {`Manage milestone: ${clip(milestone.title, MAX_TITLE_LENGTH)}`}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
