import { AlertTriangle, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import type { WalletNetwork } from "../context/WalletContext";
import { Text } from "./Text";
import { SafeLink } from "./SafeLink";
import { EmptyState } from "./EmptyState";
import { getExplorerTxUrl } from "../utils/explorer";
import {
  isPlausibleStellarAddress,
  isValidCurrency,
  isValidTxHash,
} from "../utils/vaultState";
import "./FundReleaseStatus.css";

export type FundReleaseOutcome = "released" | "redirected" | "pending";

export interface SettlementTransaction {
  hash?: string;
  timestamp?: string;
}

export interface FundReleaseStatusProps {
  outcome: FundReleaseOutcome;
  destinationAddress?: string;
  amount: number;
  currency: string;
  transaction?: SettlementTransaction;
  network?: WalletNetwork;
  isLoading?: boolean;
}

export const MAX_AMOUNT = 1_000_000_000_000;
export const MAX_CURRENCY_LENGTH = 16;
export const MAX_ADDRESS_LENGTH = 128;
export const MAX_HASH_LENGTH = 128;

export function truncateMiddle(value: string, prefixLength = 6, suffixLength = 4): string {
  if (typeof value !== "string" || value.length === 0) {
    return "Unavailable";
  }
  if (value.length <= prefixLength + suffixLength + 3) {
    return value;
  }
  return `${value.slice(0, prefixLength)}...${value.slice(-suffixLength)}`;
}

function networkLabel(network: WalletNetwork | null | undefined): string {
  return network === "PUBLIC" ? "mainnet" : "testnet";
}

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) {
    return "Pending confirmation";
  }
  const parsed = new Date(timestamp);
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

function checkInvariants(outcome: FundReleaseOutcome, transaction?: SettlementTransaction): Error | null {
  const hasTx = !!(transaction?.hash || transaction?.timestamp);
  if ((outcome === "released" || outcome === "redirected") && !hasTx) {
    return new Error(`Settlement transaction details are required for ${outcome} funds.`);
  }
  if (outcome === "pending" && hasTx) {
    return new Error(`Pending settlement cannot have transaction details.`);
  }
  return null;
}

function collectViolations({
  outcome,
  destinationAddress,
  transaction,
}: {
  outcome: FundReleaseOutcome;
  destinationAddress?: string;
  transaction?: SettlementTransaction;
}): string[] {
  const violations: string[] = [];
  const hasTx = !!(transaction?.hash || transaction?.timestamp);
  const isFinal = outcome === "released" || outcome === "redirected";
  if (isFinal && !destinationAddress) {
    violations.push("final-outcome-missing-destination");
  }
  if (outcome === "pending" && hasTx) {
    violations.push("pending-has-settlement-details");
  }
  if (typeof destinationAddress === "string" && destinationAddress.length > MAX_ADDRESS_LENGTH) {
    violations.push("destination-overflow");
  }
  return violations;
}

function displayAmount(amount: number, outcome: FundReleaseOutcome): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return outcome === "pending" ? "0" : "Unavailable";
  }
  if (amount < 0) return "0";
  if (amount > MAX_AMOUNT) return MAX_AMOUNT.toLocaleString();
  return amount.toLocaleString();
}

function displayCurrency(currency: string): string {
  if (typeof currency !== "string" || currency.trim().length === 0) {
    return "UNKNOWN";
  }
  if (/^[A-Za-z]+$/.test(currency) && currency.length > MAX_CURRENCY_LENGTH) {
    return currency.slice(0, MAX_CURRENCY_LENGTH);
  }
  if (!isValidCurrency(currency)) {
    return "UNKNOWN";
  }
  return currency;
}

const OUTCOME_COPY = {
  released: {
    title: "Funds released",
    description: "USDC was released to the success destination.",
    icon: CheckCircle2,
  },
  redirected: {
    title: "Funds redirected",
    description: "USDC was redirected to the failure destination.",
    icon: AlertTriangle,
  },
  pending: {
    title: "Settlement pending",
    description: "USDC remains locked until validation or deadline settlement completes.",
    icon: Clock3,
  },
} satisfies Record<FundReleaseOutcome, { title: string; description: string; icon: typeof CheckCircle2 }>;

export function FundReleaseStatus({
  outcome,
  destinationAddress,
  amount,
  currency,
  transaction,
  network,
  isLoading,
}: FundReleaseStatusProps) {
  const { network: walletNetwork } = useWallet();
  const copy = OUTCOME_COPY[outcome] ?? OUTCOME_COPY.pending;
  const Icon = copy.icon;
  const hash = transaction?.hash;
  const validHash = isValidTxHash(hash);
  const explorerNetwork = network ?? walletNetwork;
  const walletNetworkMismatch =
    network !== undefined &&
    walletNetwork !== null &&
    network !== walletNetwork;

  const violations = collectViolations({ outcome, destinationAddress, transaction });
  if (violations.length > 0) {
    console.warn("[FundReleaseStatus] invariant violation", {
      outcome,
      violations,
    });
  }

  if (isLoading) {
    return (
      <div className="fund-release-status fund-release-status--loading" aria-busy="true" aria-live="polite">
        <Loader2 className="fund-release-status__spinner" aria-hidden="true" size={24} />
        <Text role="body" as="p">Loading settlement status...</Text>
      </div>
    );
  }

  const invariantError = checkInvariants(outcome, transaction);
  const formattedAmount = displayAmount(amount, outcome);
  const displayCurrencyValue = displayCurrency(currency);
  const safeDestination =
    typeof destinationAddress === "string" && destinationAddress.length > 0
      ? destinationAddress
      : undefined;
  const destinationVerified = isPlausibleStellarAddress(safeDestination);

  return (
    <section
      className={`fund-release-status fund-release-status--${outcome}`}
      aria-label={`Fund settlement status: ${copy.title}`}
    >
      {invariantError ? (
        <div className="fund-release-status__error" role="alert" aria-live="assertive">
          <EmptyState
            icon={<AlertTriangle size={32} style={{ color: "var(--danger, red)" }} />}
            title="Cannot load settlement status"
            description={invariantError.message}
          />
        </div>
      ) : null}

      <div className="fund-release-status__header">
        <span
          className={`fund-release-status__icon fund-release-status__icon--${outcome}`}
          aria-hidden="true"
        >
          <Icon size={22} />
        </span>
        <div>
          <Text role="title" as="h2" className="fund-release-status__title">
            {copy.title}
          </Text>
          <Text role="body" as="p" className="fund-release-status__description">
            {copy.description}
          </Text>
        </div>
      </div>

      {outcome === "pending" ? (
        <Text role="body" as="p" className="fund-release-status__pending-copy">
          Settlement transaction details will appear after funds are released or redirected.
        </Text>
      ) : null}

      {walletNetworkMismatch && (
        <p
          className="fund-release-status__network-warning"
          role="status"
          aria-label="Network mismatch notice"
        >
          This settlement belongs to the {networkLabel(network)} contract, but your wallet is
          connected to {networkLabel(walletNetwork)}. Transaction explorer links may not match
          the network your wallet expects.
        </p>
      )}

      <div className="fund-release-status__grid">
        <div className="fund-release-status__field">
          <Text role="caption" as="span" className="fund-release-status__label">
            Destination
          </Text>
          {safeDestination ? (
            <Text
              role="mono"
              as="span"
              className="fund-release-status__value"
              title={safeDestination}
              aria-label={`Destination address ${safeDestination}`}
            >
              {truncateMiddle(safeDestination)}
              {!destinationVerified && (
                <span className="fund-release-status__unverified"> (unverified)</span>
              )}
            </Text>
          ) : (
            <Text role="caption" as="span" className="fund-release-status__label">
              Not available
            </Text>
          )}
        </div>
        <div className="fund-release-status__field">
          <Text role="caption" as="span" className="fund-release-status__label">
            Amount
          </Text>
          <Text role="mono" as="span" className="fund-release-status__value">
            {`${formattedAmount} ${displayCurrencyValue}`}
          </Text>
        </div>
        <div className="fund-release-status__field">
          <Text role="caption" as="span" className="fund-release-status__label">
            Settled
          </Text>
          <Text role="caption" as="span" className="fund-release-status__value">
            {formatTimestamp(transaction?.timestamp)}
          </Text>
        </div>
        <div className="fund-release-status__field">
          <Text role="caption" as="span" className="fund-release-status__label">
            Transaction
          </Text>
          {validHash && hash ? (
            <SafeLink
              className="fund-release-status__link"
              href={explorerUrl(hash.slice(0, MAX_HASH_LENGTH), explorerNetwork)}
              title={hash}
              aria-label={`View transaction ${hash} on Stellar ${explorerNetwork === "PUBLIC" ? "Public" : "Testnet"} explorer`}
            >
              {truncateMiddle(hash, 8, 6)}
            </SafeLink>
          ) : hash ? (
            <Text role="caption" as="span" className="fund-release-status__label">
              Invalid transaction hash
            </Text>
          ) : (
            <Text role="caption" as="span" className="fund-release-status__label">
              Pending transaction
            </Text>
          )}
        </div>
      </div>
    </section>
  );
}

function explorerUrl(hash: string, network: WalletNetwork | null | undefined): string {
  return getExplorerTxUrl(hash, network ?? null);
}
