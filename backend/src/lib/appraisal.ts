import { Grade } from "@prisma/client";
import { applyBps, type Kobo } from "./money.js";

/**
 * Turns a device description into an offer.
 *
 * Two rules shaped this file. First, the output has to be explainable: when a
 * seller asks why their phone came back at ₦224,500 we hand them the line
 * items, not a shrug. Second, it has to be boring. A pricing engine that
 * surprises people costs more in arguments than it saves in margin.
 *
 * Every deduction is a percentage of the base new price, applied in sequence
 * off the running value rather than all off the original. Applying them all
 * off the original double counts: a cracked screen on a four year old phone
 * should not deduct the same absolute naira as one on a device bought last
 * month.
 */

export interface AppraisalInput {
  baseNewKobo: Kobo;
  ageMonths: number;
  grade: Grade;
  batteryHealth?: number | null;
  hasOriginalBox?: boolean;
  hasCharger?: boolean;
  isCracked?: boolean;
  category?: string;
}

export interface AppraisalLine {
  label: string;
  bps: number;      // negative reduces, positive adds
  deltaKobo: Kobo;
}

export interface AppraisalResult {
  offerKobo: Kobo;       // what we pay the seller
  suggestedListKobo: Kobo; // what we would list it at
  marginKobo: Kobo;
  lines: AppraisalLine[];
  confidence: "high" | "medium" | "low";
}

/**
 * Depreciation, tuned to what devices actually resell for here rather than to
 * a tidy curve. Phones lose roughly a third in the first year and keep sliding
 * about a fifth a year after that. Laptops hold value better, which is why
 * they get their own numbers.
 *
 * These are the figures to revisit once there is real sales data. Until then
 * they err slightly low, because a quote that comes in under market costs one
 * negotiation and a quote that comes in over market costs real money.
 */
function depreciationBps(ageMonths: number, category = "phone"): number {
  const months = Math.max(0, Math.min(ageMonths, 96));
  const yearOne = category === "laptop" ? 2600 : 3300;
  const perYearAfter = category === "laptop" ? 1500 : 1900;

  if (months <= 12) return Math.round((yearOne * months) / 12);
  const extraYears = (months - 12) / 12;
  const raw = yearOne + perYearAfter * extraYears;
  return Math.min(Math.round(raw), 8200); // nothing goes below 18% of new
}

const GRADE_BPS: Record<Grade, number> = {
  [Grade.MINT]: 0,
  [Grade.EXCELLENT]: 400,
  [Grade.GOOD]: 900,
  [Grade.FAIR]: 1800,
};

/**
 * Battery is only charged for below 90%. Above that the difference is not
 * something a buyer notices, and deducting for it makes the offer feel mean
 * for no commercial gain.
 */
function batteryBps(health?: number | null): number {
  if (health == null) return 300; // unknown is priced as slightly bad news
  if (health >= 90) return 0;
  if (health >= 85) return 250;
  if (health >= 80) return 600;
  if (health >= 75) return 1000;
  return 1600;
}

/** How much we mark up a verified used device when reselling. */
function markupBps(grade: Grade): number {
  switch (grade) {
    case Grade.MINT:
    case Grade.EXCELLENT:
      return 1600;
    case Grade.GOOD:
      return 1400;
    case Grade.FAIR:
      return 1100; // thinner, because fair stock sits longer
  }
}

export function appraise(input: AppraisalInput): AppraisalResult {
  const {
    baseNewKobo,
    ageMonths,
    grade,
    batteryHealth,
    hasOriginalBox = false,
    hasCharger = false,
    isCracked = false,
    category = "phone",
  } = input;

  if (baseNewKobo <= 0n) throw new Error("Base price must be above zero");

  const lines: AppraisalLine[] = [];
  let running = baseNewKobo;

  const step = (label: string, bps: number) => {
    const delta = applyBps(running, Math.abs(bps));
    const signed = bps < 0 ? -delta : delta;
    running += signed;
    lines.push({ label, bps, deltaKobo: signed });
  };

  step("Age and depreciation", -depreciationBps(ageMonths, category));

  const gradeBps = GRADE_BPS[grade];
  if (gradeBps > 0) step(`Condition: ${grade.toLowerCase()}`, -gradeBps);

  const battBps = batteryBps(batteryHealth);
  if (battBps > 0) {
    const label = batteryHealth == null
      ? "Battery health not provided"
      : `Battery at ${batteryHealth}%`;
    step(label, -battBps);
  }

  if (isCracked) step("Cracked screen or glass", -1500);
  if (hasOriginalBox) step("Original box", 200);
  if (hasCharger) step("Charger included", 150);

  // Never offer under 15% of new. Below that we are not buying a phone, we are
  // buying a problem, and the seller is better off keeping it.
  const floor = applyBps(baseNewKobo, 1500);
  const offerKobo = running < floor ? floor : running;

  const suggestedListKobo = offerKobo + applyBps(offerKobo, markupBps(grade));
  const marginKobo = suggestedListKobo - offerKobo;

  const confidence: AppraisalResult["confidence"] =
    batteryHealth == null ? "low" : ageMonths > 60 ? "medium" : "high";

  return { offerKobo, suggestedListKobo, marginKobo, lines, confidence };
}

/**
 * Trade-in credit runs the same engine then takes a little less risk, because
 * the device has not been inspected when the credit is applied at checkout.
 * The gap is what covers us when the phone in the box is worse than described.
 */
export function tradeInCredit(input: AppraisalInput): Kobo {
  const { offerKobo } = appraise(input);
  return offerKobo - applyBps(offerKobo, 700);
}
