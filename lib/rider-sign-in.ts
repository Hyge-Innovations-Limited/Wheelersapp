import { waitWords } from "./countdown";
import { toUserMessage } from "./error-messages";

/** Seconds a rider waits before asking for another code. */
export const RESEND_WAIT_SECONDS = 60;
export const CODE_LENGTH = 6;

/**
 * "+2348031234567" from however the number was typed (0803…, 803…, 234803…,
 * +234 803…). Null when it is not a Nigerian mobile number.
 */
export function riderPhoneFrom(typed: string): string | null {
  const digits = typed.replace(/\D/g, "");
  const national = digits.startsWith("234")
    ? digits.slice(3)
    : digits.startsWith("0")
      ? digits.slice(1)
      : digits;
  return /^[789][01]\d{8}$/.test(national) ? `+234${national}` : null;
}

/** "+234 803 123 4567": a number shown back to the person who typed it. */
export function spacedPhone(phone: string): string {
  const match = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return match ? `+234 ${match[1]} ${match[2]} ${match[3]}` : phone;
}

/** "803 123 4567" as the rider types "8031234567". */
export function groupNationalDigits(typed: string): string {
  const digits = typed.replace(/\D/g, "").replace(/^234/, "").replace(/^0/, "").slice(0, 10);
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join(" ");
}

/** What to tell a rider when sending or checking a code fails. */
export function signInErrorMessage(error: unknown): string {
  // The server's machine-readable reason, when it gave one (see ApiError).
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (typeof code === "string") {
    switch (code) {
      case "OTP_RATE_LIMITED":
        return "You have asked for too many codes. Wait 10 minutes, then try again.";
      case "OTP_WINDOW_CLOSED":
      case "OTP_DELIVERY_FAILED":
        return "We could not send a code to this number. Check the number and try again.";
      case "OTP_INVALID":
        return "That code is not correct. Check it and try again.";
      case "OTP_LOCKED":
        return "Too many wrong tries. Ask for a new code.";
      case "OTP_NOT_FOUND":
        return "That code has expired. Ask for a new one.";
      default:
        break;
    }
  }
  return toUserMessage(error, "Something went wrong. Please try again.");
}

/** "Send again in 42 seconds" / "Send a new code". */
export function resendLabel(secondsLeft: number): string {
  return secondsLeft > 0 ? `Send again in ${waitWords(secondsLeft)}` : "Send a new code";
}

/** The first word of a name: what we call someone. */
export function firstNameOf(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** Looks enough like an email address to send to the server, which decides. */
export function looksLikeEmail(typed: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(typed.trim());
}
