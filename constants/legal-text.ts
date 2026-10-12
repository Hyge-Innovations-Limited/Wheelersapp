/**
 * The Terms of Service and the privacy summary as the app shows them, so a
 * person can read and accept them without leaving the app. The same terms are
 * on the website (wheelersng.com/terms); when one changes, change the other
 * and move TERMS_VERSION on, which asks everyone to accept again.
 */
export const TERMS_VERSION = "2026-10-12";
export const TERMS_UPDATED = "12 October 2026";

export type LegalSection = { title: string; body: string[] };

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: "1. About these terms",
    body: [
      "These terms apply when you use Wheelers to request a ride or to drive, in the Wheelers app or through Wheelers on WhatsApp. By creating an account or booking a ride you agree to them.",
      "Wheelers connects riders who want a ride with drivers who offer one. Riders say what they are willing to pay, and drivers accept that price or answer with their own.",
    ],
  },
  {
    title: "2. Your account",
    body: [
      "You must be at least 18 years old to use Wheelers. Give us accurate details and keep them up to date.",
      "Riders sign in with a phone number and a code we send to it. Drivers sign in with Apple, Google or email. You are responsible for what happens on your account, so keep your phone, your codes and your wallet PIN to yourself.",
      "One person, one account. Do not let someone else ride or drive on yours.",
    ],
  },
  {
    title: "3. Booking a ride and agreeing a price",
    body: [
      "When you book, Wheelers shows a suggested price and the lowest price you may offer for that trip. You choose the price you offer.",
      "Drivers near you can accept your price or reply with a different one. You are free to accept any offer, change your price, or decline. A ride is agreed only when you accept a driver's offer.",
      "The price you agree is the total for that trip. It already includes VAT and the Wheelers service charge. If you add or change a stop during the trip, the price is worked out again and shown to you.",
    ],
  },
  {
    title: "4. Paying",
    body: [
      "Rides are paid from your Wheelers wallet. You add money to the wallet by bank transfer to the account number shown in the app.",
      "When you accept a driver, the agreed price is held in your wallet. It is charged when the trip is completed. If the ride is cancelled, or no driver accepts, the held amount goes back to your wallet.",
      "You can withdraw money from your wallet to your bank account. A withdrawal fee applies and is shown before you confirm.",
    ],
  },
  {
    title: "5. Cancelling",
    body: [
      "You can cancel a search at any time and nothing is charged. You can also cancel after a driver has accepted; please do it as early as you can and tell us why.",
      "A driver may cancel too. If that happens we look for another driver for you where we can.",
      "Wheelers may introduce a cancellation fee in future. If we do, the app will show it before you cancel.",
    ],
  },
  {
    title: "6. Scheduled rides",
    body: [
      "You can book a ride for a later time. We start looking for a driver shortly before that time. A scheduled ride is a request, not a guarantee that a driver will accept it.",
    ],
  },
  {
    title: "7. Drivers",
    body: [
      "To drive with Wheelers you must complete verification and keep your licence and your vehicle's papers valid. You must tell us if any of them changes, expires or is withdrawn.",
      "You choose which trips to offer on and at what price. Wheelers keeps a commission and any charges shown in the app from each completed trip; the rest is paid into your wallet.",
      "You are responsible for your vehicle, for driving safely and lawfully, and for the taxes and levies that apply to you.",
    ],
  },
  {
    title: "8. Safety and conduct",
    body: [
      "Treat each other with respect. Do not threaten, harass or discriminate against anyone you meet through Wheelers.",
      "Riders: be at the pickup point, give the trip code only to your driver once you are in the car, and wear a seat belt. Drivers: confirm the trip code before starting, follow the route, and do not carry anyone who is not part of the booking.",
      "In an emergency, use the Emergency button in the app and call the emergency services.",
      "We may suspend or close an account that breaks these terms, that is used for fraud, or that puts other people at risk.",
    ],
  },
  {
    title: "9. Referrals and cashback",
    body: [
      "If you share a referral code or use one, the rewards and their conditions are the ones shown in the app at the time. Ride cashback can only be used towards rides and has no cash value. We may withdraw rewards obtained by abuse.",
    ],
  },
  {
    title: "10. Our responsibility",
    body: [
      "We work to keep Wheelers available and accurate, but we do not promise that a driver will always be available, that a trip will take a particular time, or that the service will never be interrupted.",
      "Nothing in these terms limits any right you have under the law that cannot be limited.",
    ],
  },
  {
    title: "11. Changes to these terms",
    body: [
      "We may update these terms as Wheelers changes. When we make a material change we will ask you to read and accept the new terms in the app.",
    ],
  },
  {
    title: "12. Law",
    body: ["These terms are governed by the laws of the Federal Republic of Nigeria."],
  },
];

/** What the app collects and why, in plain words. The full policy is on the website. */
export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: "What we collect",
    body: [
      "Your phone number, your name, and your email address if you give one.",
      "Where you are while you book and during a trip, the places you ride between, and the places you save.",
      "Your wallet: the money you add, the rides you pay for and your withdrawals, including the bank account you withdraw to.",
      "Messages you send to your driver and to Wheelers support, and calls made through the app.",
      "For drivers: the identity, licence and vehicle documents you upload, your photo, and your location while you are online.",
    ],
  },
  {
    title: "What we use it for",
    body: [
      "To find you a driver, show the driver where to pick you up, work out prices, take payment and pay drivers.",
      "To keep trips safe: verifying drivers, handling emergencies and complaints, and stopping fraud.",
      "To send you trip updates, receipts and codes.",
    ],
  },
  {
    title: "Who sees it",
    body: [
      "Your driver sees your first name, your pickup and destination, and your trip code when you give it. You see your driver's name, car and plate number.",
      "Companies that help us run Wheelers (payments, maps, messages and SMS) receive what they need to do that job.",
      "We do not sell your personal information.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "You can change your details in the app, turn off location when you are not booking, and ask us to delete your account through Help and support.",
    ],
  },
];
