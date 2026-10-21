import { z } from "zod";
import {
  AmountMinorSchema,
  CurrencyCodeSchema,
  IsoDateTimeSchema,
  MetadataSchema,
  PaginationQuerySchema,
  UuidSchema,
} from "./common.js";

/**
 * Payments and pricing policies.
 *
 * Money is always an integer in the minor unit plus a currency code. A
 * pricing policy is immutable: changing one creates a new version, and a
 * session keeps the policy version that was effective when it was created.
 */

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

/** The status of a payment. */
export const PaymentStatusSchema = z.enum([
  "UNPAID",
  "PENDING",
  "PAID",
  "FAILED",
  "EXEMPT",
  "VOIDED",
]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

/** The method a fee was settled by. */
export const PaymentMethodSchema = z.enum(["CASH", "TRANSFER", "QRIS", "CARD", "OTHER"]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

/** A payment record. */
export const PaymentSchema = z.object({
  id: UuidSchema,
  sessionId: UuidSchema,
  siteId: UuidSchema,
  status: PaymentStatusSchema,
  amountMinor: AmountMinorSchema,
  currency: CurrencyCodeSchema,
  method: PaymentMethodSchema.nullable(),
  /** Set for an `EXEMPT` payment; mandatory when a guard grants an exemption. */
  exemptionReason: z.string().trim().min(1).max(500).nullable(),
  capturedAt: IsoDateTimeSchema.nullable(),
  recordedByUserId: UuidSchema.nullable(),
  metadata: MetadataSchema.optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Payment = z.infer<typeof PaymentSchema>;

/**
 * The body of a payment-recording request.
 *
 * A client never supplies the currency — it comes from the site or the
 * pricing policy.
 */
export const RecordPaymentRequestSchema = z.object({
  amountMinor: AmountMinorSchema,
  method: PaymentMethodSchema,
  /** An external reference, e.g. a transfer id. */
  reference: z.string().trim().min(1).max(200).optional(),
  note: z.string().trim().max(500).optional(),
});
export type RecordPaymentRequest = z.infer<typeof RecordPaymentRequestSchema>;

/** The body of a fee-exemption request. The reason is mandatory. */
export const ExemptPaymentRequestSchema = z.object({
  reason: z.string().trim().min(1, "An exemption requires a reason").max(500),
});
export type ExemptPaymentRequest = z.infer<typeof ExemptPaymentRequestSchema>;

/** The list query for the payment collection. */
export const ListPaymentsQuerySchema = PaginationQuerySchema.extend({
  siteId: UuidSchema.optional(),
  sessionId: UuidSchema.optional(),
  status: PaymentStatusSchema.optional(),
});
export type ListPaymentsQuery = z.infer<typeof ListPaymentsQuerySchema>;

// ---------------------------------------------------------------------------
// Pricing policies
// ---------------------------------------------------------------------------

/** The rule type of a pricing policy. */
export const PricingRuleTypeSchema = z.enum(["FLAT", "HOURLY", "TIERED"]);
export type PricingRuleType = z.infer<typeof PricingRuleTypeSchema>;

/** The configuration of a flat-fee policy. */
export const FlatPricingConfigSchema = z.object({
  ruleType: z.literal("FLAT"),
  amountMinor: AmountMinorSchema,
  currency: CurrencyCodeSchema,
});
export type FlatPricingConfig = z.infer<typeof FlatPricingConfigSchema>;

/** The configuration of an hourly-fee policy. */
export const HourlyPricingConfigSchema = z.object({
  ruleType: z.literal("HOURLY"),
  rateMinor: AmountMinorSchema,
  /** The billing unit in minutes. Usually 60. */
  perMinutes: z.number().int().positive().default(60),
  /** Free minutes before the first billable unit. */
  graceMinutes: z.number().int().nonnegative().default(0),
  /** An optional cap on the total fee. */
  maxAmountMinor: AmountMinorSchema.nullable().default(null),
  currency: CurrencyCodeSchema,
});
export type HourlyPricingConfig = z.infer<typeof HourlyPricingConfigSchema>;

/** One band of a tiered policy. */
export const PricingTierSchema = z.object({
  /** The upper bound of the band in minutes. `null` is the catch-all band. */
  upToMinutes: z.number().int().positive().nullable(),
  amountMinor: AmountMinorSchema,
});
export type PricingTier = z.infer<typeof PricingTierSchema>;

/** The configuration of a tiered policy. */
export const TieredPricingConfigSchema = z.object({
  ruleType: z.literal("TIERED"),
  tiers: z
    .array(PricingTierSchema)
    .min(1, "A tiered policy needs at least one band")
    .refine(
      (tiers) => tiers.filter((tier) => tier.upToMinutes === null).length <= 1,
      "A tiered policy may have at most one catch-all band",
    ),
  currency: CurrencyCodeSchema,
});
export type TieredPricingConfig = z.infer<typeof TieredPricingConfigSchema>;

/**
 * The configuration of a pricing policy, discriminated by `ruleType`.
 *
 * A client creating a policy must supply the configuration that matches the
 * rule type exactly — no extra keys, no missing keys.
 */
export const PricingConfigSchema = z.discriminatedUnion("ruleType", [
  FlatPricingConfigSchema,
  HourlyPricingConfigSchema,
  TieredPricingConfigSchema,
]);
export type PricingConfig = z.infer<typeof PricingConfigSchema>;

/** A versioned pricing policy. */
export const PricingPolicySchema = z.object({
  id: UuidSchema,
  siteId: UuidSchema,
  /** Monotonically increasing per site, starting at 1. */
  version: z.number().int().positive(),
  ruleType: PricingRuleTypeSchema,
  config: PricingConfigSchema,
  /** The moment this version becomes effective. A future date is not used yet. */
  effectiveFrom: IsoDateTimeSchema,
  isActive: z.boolean(),
  createdAt: IsoDateTimeSchema,
});
export type PricingPolicy = z.infer<typeof PricingPolicySchema>;

/** The body of a pricing-policy creation request. */
export const CreatePricingPolicyRequestSchema = z.object({
  ruleType: PricingRuleTypeSchema,
  config: PricingConfigSchema,
  effectiveFrom: z.coerce.date(),
});
export type CreatePricingPolicyRequest = z.infer<typeof CreatePricingPolicyRequestSchema>;

/** The computed fee for a session. */
export const FeeSchema = z.object({
  amountMinor: AmountMinorSchema,
  currency: CurrencyCodeSchema,
  policyVersion: z.number().int().positive().nullable(),
  breakdown: z.record(z.string(), z.unknown()).optional(),
});
export type Fee = z.infer<typeof FeeSchema>;
