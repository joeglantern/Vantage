/**
 * An in-memory model of the disbursement runtime described in
 * docs/04-payout-lifecycle.md, sections 5 to 7.
 *
 * The model deliberately owns NO business rules of its own. Every state change
 * goes through the real domain functions, so a property that holds here holds
 * for the code that ships. The model only supplies the hostile environment:
 * at-least-once job delivery, duplicate callbacks, timeouts, crashes and
 * out-of-order probe results.
 */
import {
  transitionItem,
  type ItemStatus,
  type ItemEvent,
} from '@domain/payout-item';
import { ledgerEntryForTransition, type LedgerEntryType } from '@domain/ledger';

/** What the simulated gateway does with a B2C request. */
export type GatewayOutcome =
  | { kind: 'accepted'; conversationId: string }
  | { kind: 'rejected'; code: string }
  | { kind: 'timeout' };

/** One thing the environment does to the system. */
export type Operation =
  | { op: 'run_disburse_job'; gateway: GatewayOutcome }
  | { op: 'worker_crash_mid_job' }
  | { op: 'deliver_callback'; success: boolean }
  | { op: 'callback_sla_expired' }
  | { op: 'run_status_probe'; result: 'success' | 'failure' | 'indeterminate' }
  | { op: 'human_retry' };

export interface SendAttempt {
  readonly originatorConversationId: string;
  /** The status the item was in when the request went out. */
  readonly claimedFrom: ItemStatus;
}

export class ItemModel {
  status: ItemStatus = 'pending';

  /** Generated once at approval and never regenerated (docs/04, rule 1). */
  readonly originatorConversationId: string;

  conversationId: string | undefined;
  attemptCount = 0;

  readonly sendAttempts: SendAttempt[] = [];
  readonly ledger: LedgerEntryType[] = [];
  readonly statusHistory: ItemStatus[] = ['pending'];

  constructor(originatorConversationId: string) {
    this.originatorConversationId = originatorConversationId;
  }

  /** Applies an event through the real domain state machine, or ignores it. */
  private apply(event: ItemEvent): boolean {
    const result = transitionItem(this.status, event);
    if (!result.ok) return false;

    const entry = ledgerEntryForTransition(this.status, result.to);
    if (entry !== null) this.ledger.push(entry);

    this.status = result.to;
    this.statusHistory.push(result.to);
    return true;
  }

  /** Batch approval: the only path out of `pending`. */
  approve(): void {
    this.apply({ kind: 'batch_approved' });
  }

  /**
   * The disburse job, mirroring docs/04 section 5. BullMQ is at-least-once, so
   * this may be called any number of times for one item.
   */
  runDisburseJob(gateway: GatewayOutcome): void {
    // Guarded claim. Only `queued` is claimable, so a second worker, or a
    // redelivered job, finds nothing to do and exits quietly.
    const claimedFrom = this.status;
    if (!this.apply({ kind: 'worker_claimed' })) return;

    this.attemptCount += 1;
    // The SAME originator_conversation_id on every attempt. Never regenerated.
    this.sendAttempts.push({
      originatorConversationId: this.originatorConversationId,
      claimedFrom,
    });

    switch (gateway.kind) {
      case 'accepted':
        this.conversationId = gateway.conversationId;
        this.apply({ kind: 'gateway_accepted' });
        return;
      case 'rejected':
        this.apply({ kind: 'gateway_rejected', code: gateway.code });
        return;
      case 'timeout':
        // A timeout is not a failure. It becomes `unknown` and is probed.
        this.apply({ kind: 'gateway_timeout' });
        return;
    }
  }

  /**
   * The worker dies after claiming but before the gateway responds. The job
   * returns to the queue; the state guard is what prevents a double send.
   */
  workerCrashMidJob(gateway: GatewayOutcome): void {
    const claimedFrom = this.status;
    if (!this.apply({ kind: 'worker_claimed' })) return;

    this.attemptCount += 1;
    this.sendAttempts.push({
      originatorConversationId: this.originatorConversationId,
      claimedFrom,
    });
    // Process dies here. The gateway outcome is never recorded, and the item is
    // left in `sending` for the reconciliation sweep to pick up.
    void gateway;
  }

  /** A result callback from Daraja. May arrive twice, or for a stale item. */
  deliverCallback(success: boolean): void {
    this.apply(
      success
        ? { kind: 'callback_success' }
        : { kind: 'callback_failure', code: 'DS_FAILED' },
    );
  }

  /** The reconciliation sweep: `sent` with no callback past the SLA. */
  callbackSlaExpired(): void {
    this.apply({ kind: 'callback_sla_expired' });
  }

  /** Transaction Status Query result for an `unknown` item. */
  runStatusProbe(result: 'success' | 'failure' | 'indeterminate'): void {
    switch (result) {
      case 'success':
        this.apply({ kind: 'probe_success' });
        return;
      case 'failure':
        this.apply({ kind: 'probe_failure', code: 'DS_NOT_FOUND' });
        return;
      case 'indeterminate':
        this.apply({ kind: 'probe_indeterminate' });
        return;
    }
  }

  /** A human explicitly retries an item that failed for an unambiguous reason. */
  humanRetry(): void {
    this.apply({ kind: 'human_retry' });
  }

  step(operation: Operation): void {
    switch (operation.op) {
      case 'run_disburse_job':
        this.runDisburseJob(operation.gateway);
        return;
      case 'worker_crash_mid_job':
        this.workerCrashMidJob({ kind: 'timeout' });
        return;
      case 'deliver_callback':
        this.deliverCallback(operation.success);
        return;
      case 'callback_sla_expired':
        this.callbackSlaExpired();
        return;
      case 'run_status_probe':
        this.runStatusProbe(operation.result);
        return;
      case 'human_retry':
        this.humanRetry();
        return;
    }
  }

  // --- Observations the properties assert over -----------------------------

  timesConfirmed(): number {
    return this.statusHistory.filter((s) => s === 'confirmed').length;
  }

  disbursedLedgerEntries(): number {
    return this.ledger.filter((e) => e === 'disbursed').length;
  }
}
