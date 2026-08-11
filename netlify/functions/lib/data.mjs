// Mock CRM datasets.
//
// One cast of 12 people, four industry payloads over the top. The phone numbers
// are the same in every industry, so a demo script keeps working when you
// switch dataset — only the returned fields change.
//
// Field types drive what the API generates:
//   string   as-is
//   number   as-is
//   money    plus a "<name>Text" companion — "SAR 412.50", which TTS reads
//            correctly where 412.5 does not
//   date     stored as a DAY OFFSET from today, emitted as ISO plus a
//            "<name>Spoken" companion. Offsets rather than fixed dates because
//            a demo built on hardcoded dates goes stale the week after you
//            record it.

export const BRAND = "Mock CRM";
export const DEFAULT_INDUSTRY = "telco";

// Shared across every dataset. Same numbers, same names, whichever you pick.
export const PEOPLE = [
  { id: 1,  phoneNumber: "+966501234001", firstName: "Ahmed" },
  { id: 2,  phoneNumber: "+966501234002", firstName: "Sara" },
  { id: 3,  phoneNumber: "+966501234003", firstName: "John" },
  { id: 4,  phoneNumber: "+966501234004", firstName: "Fatima" },
  { id: 5,  phoneNumber: "+966501234005", firstName: "Rajesh" },
  { id: 6,  phoneNumber: "+966501234006", firstName: "Layla" },
  { id: 7,  phoneNumber: "+966501234007", firstName: "Omar" },
  { id: 8,  phoneNumber: "+966501234008", firstName: "Mei" },
  { id: 9,  phoneNumber: "+966501234009", firstName: "David" },
  { id: 10, phoneNumber: "+966501234010", firstName: "Noura" },
  { id: 11, phoneNumber: "+966501234011", firstName: "Tom" },
  { id: 12, phoneNumber: "+966501234012", firstName: "Aisha" },
];

// Present in every dataset, so a flow can rely on them regardless of industry.
export const COMMON_FIELDS = [
  { name: "id", type: "number", note: "Record id (mockapi.io convention)" },
  { name: "phoneNumber", type: "string", note: "Lookup key. E.164." },
  { name: "firstName", type: "string", note: "Greet the caller with this." },
];

export const INDUSTRIES = {
  telco: {
    label: "Telco",
    currency: "SAR",
    blurb: "Mobile and fibre subscriber — the default dataset.",
    fields: [
      { name: "accountNumber", type: "string", note: "Account reference." },
      { name: "billAmount", type: "money", note: "Outstanding bill." },
      { name: "deviceType", type: "string", note: "Handset or CPE model." },
    ],
    data: {
      1:  { accountNumber: "ACC-884101", billAmount: 412.50,  deviceType: "iPhone 16 Pro" },
      2:  { accountNumber: "ACC-884102", billAmount: 0,       deviceType: "Samsung Galaxy A55" },
      3:  { accountNumber: "ACC-884103", billAmount: 1240.00, deviceType: "Google Pixel 8a" },
      4:  { accountNumber: "ACC-884104", billAmount: 249.00,  deviceType: "iPhone 15" },
      5:  { accountNumber: "ACC-884105", billAmount: 0,       deviceType: "OnePlus 12" },
      6:  { accountNumber: "ACC-884106", billAmount: 129.00,  deviceType: "iPhone 12" },
      7:  { accountNumber: "ACC-884107", billAmount: 2450.00, deviceType: "Business Fleet Router" },
      8:  { accountNumber: "ACC-884108", billAmount: 0,       deviceType: "iPhone 16" },
      9:  { accountNumber: "ACC-884109", billAmount: 872.40,  deviceType: "iPhone 15 Pro Max" },
      10: { accountNumber: "ACC-884110", billAmount: 0,       deviceType: "Samsung Galaxy S24" },
      11: { accountNumber: "ACC-884111", billAmount: 389.00,  deviceType: "Fibre Router X2" },
      12: { accountNumber: "ACC-884112", billAmount: 129.00,  deviceType: "iPhone 13" },
    },
  },

  banking: {
    label: "Banking",
    currency: "SAR",
    blurb: "Retail bank customer. Includes two overdrawn accounts and a blocked card.",
    fields: [
      { name: "accountNumber", type: "string", note: "Masked account number." },
      { name: "balance", type: "money", note: "Cleared balance. Negative means overdrawn." },
      { name: "cardType", type: "string", note: "Card product held." },
      { name: "cardStatus", type: "string", note: "active | blocked | expiring | pending-activation" },
    ],
    data: {
      1:  { accountNumber: "****4101", balance: 84210.55,  cardType: "Visa Signature",     cardStatus: "active" },
      2:  { accountNumber: "****4102", balance: 320.10,    cardType: "Debit",              cardStatus: "active" },
      3:  { accountNumber: "****4103", balance: -1240.00,  cardType: "Visa Classic",       cardStatus: "blocked" },
      4:  { accountNumber: "****4104", balance: 15600.00,  cardType: "Mastercard Gold",    cardStatus: "active" },
      5:  { accountNumber: "****4105", balance: 2480.75,   cardType: "Debit",              cardStatus: "active" },
      6:  { accountNumber: "****4106", balance: 95.20,     cardType: "Visa Classic",       cardStatus: "expiring" },
      7:  { accountNumber: "****4107", balance: 412000.00, cardType: "Visa Infinite",      cardStatus: "active" },
      8:  { accountNumber: "****4108", balance: 0,         cardType: "Debit",              cardStatus: "pending-activation" },
      9:  { accountNumber: "****4109", balance: -350.40,   cardType: "Mastercard Platinum", cardStatus: "active" },
      10: { accountNumber: "****4110", balance: 7820.00,   cardType: "Visa Gold",          cardStatus: "active" },
      11: { accountNumber: "****4111", balance: 23400.00,  cardType: "Mastercard Gold",    cardStatus: "active" },
      12: { accountNumber: "****4112", balance: 1150.00,   cardType: "Debit",              cardStatus: "blocked" },
    },
  },

  retail: {
    label: "Retail",
    currency: "SAR",
    blurb: "E-commerce order tracking. deliveryDate is a day offset, so it never goes stale.",
    fields: [
      { name: "loyaltyId", type: "string", note: "Loyalty programme number." },
      { name: "orderNumber", type: "string", note: "Most recent order." },
      { name: "orderStatus", type: "string", note: "processing | packed | shipped | out-for-delivery | delivered | delayed | returned" },
      { name: "orderTotal", type: "money", note: "Order value." },
      { name: "deliveryDate", type: "date", note: "Expected delivery. Stored as days from today." },
    ],
    data: {
      1:  { loyaltyId: "LOY-88101", orderNumber: "ORD-77120", orderStatus: "out-for-delivery", orderTotal: 349.00,  deliveryDate: 0 },
      2:  { loyaltyId: "LOY-88102", orderNumber: "ORD-77121", orderStatus: "processing",       orderTotal: 89.50,   deliveryDate: 4 },
      3:  { loyaltyId: "LOY-88103", orderNumber: "ORD-77122", orderStatus: "delayed",          orderTotal: 1899.00, deliveryDate: 9 },
      4:  { loyaltyId: "LOY-88104", orderNumber: "ORD-77123", orderStatus: "shipped",          orderTotal: 420.00,  deliveryDate: 2 },
      5:  { loyaltyId: "LOY-88105", orderNumber: "ORD-77124", orderStatus: "delivered",        orderTotal: 65.00,   deliveryDate: -3 },
      6:  { loyaltyId: "LOY-88106", orderNumber: "ORD-77125", orderStatus: "returned",         orderTotal: 240.00,  deliveryDate: -11 },
      7:  { loyaltyId: "LOY-88107", orderNumber: "ORD-77126", orderStatus: "packed",           orderTotal: 7350.00, deliveryDate: 1 },
      8:  { loyaltyId: "LOY-88108", orderNumber: "ORD-77127", orderStatus: "processing",       orderTotal: 129.99,  deliveryDate: 6 },
      9:  { loyaltyId: "LOY-88109", orderNumber: "ORD-77128", orderStatus: "delayed",          orderTotal: 512.30,  deliveryDate: 14 },
      10: { loyaltyId: "LOY-88110", orderNumber: "ORD-77129", orderStatus: "delivered",        orderTotal: 78.00,   deliveryDate: -1 },
      11: { loyaltyId: "LOY-88111", orderNumber: "ORD-77130", orderStatus: "shipped",          orderTotal: 1240.00, deliveryDate: 3 },
      12: { loyaltyId: "LOY-88112", orderNumber: "ORD-77131", orderStatus: "out-for-delivery", orderTotal: 199.00,  deliveryDate: 0 },
    },
  },

  insurance: {
    label: "Insurance",
    currency: "SAR",
    blurb: "Policy holder. Two policies lapse inside a week, one has an open claim.",
    fields: [
      { name: "policyNumber", type: "string", note: "Policy reference." },
      { name: "policyType", type: "string", note: "Product held." },
      { name: "premiumAmount", type: "money", note: "Annual premium." },
      { name: "renewalDate", type: "date", note: "Renewal due. Stored as days from today." },
      { name: "claimStatus", type: "string", note: "none | open | assessing | approved | rejected" },
    ],
    data: {
      1:  { policyNumber: "POL-99101", policyType: "Motor Comprehensive", premiumAmount: 3400.00, renewalDate: 41,  claimStatus: "none" },
      2:  { policyNumber: "POL-99102", policyType: "Travel",              premiumAmount: 290.00,  renewalDate: 5,   claimStatus: "none" },
      3:  { policyNumber: "POL-99103", policyType: "Motor Third Party",   premiumAmount: 890.00,  renewalDate: -12, claimStatus: "rejected" },
      4:  { policyNumber: "POL-99104", policyType: "Medical Family",      premiumAmount: 12400.00, renewalDate: 88, claimStatus: "assessing" },
      5:  { policyNumber: "POL-99105", policyType: "Home",                premiumAmount: 1750.00, renewalDate: 120, claimStatus: "none" },
      6:  { policyNumber: "POL-99106", policyType: "Motor Comprehensive", premiumAmount: 2980.00, renewalDate: 3,   claimStatus: "open" },
      7:  { policyNumber: "POL-99107", policyType: "Commercial Fleet",    premiumAmount: 68000.00, renewalDate: 210, claimStatus: "approved" },
      8:  { policyNumber: "POL-99108", policyType: "Travel",              premiumAmount: 180.00,  renewalDate: 14,  claimStatus: "none" },
      9:  { policyNumber: "POL-99109", policyType: "Medical Individual",  premiumAmount: 5600.00, renewalDate: 27,  claimStatus: "open" },
      10: { policyNumber: "POL-99110", policyType: "Home",                premiumAmount: 1420.00, renewalDate: 64,  claimStatus: "none" },
      11: { policyNumber: "POL-99111", policyType: "Motor Comprehensive", premiumAmount: 4100.00, renewalDate: 6,   claimStatus: "assessing" },
      12: { policyNumber: "POL-99112", policyType: "Medical Individual",  premiumAmount: 4850.00, renewalDate: 33,  claimStatus: "none" },
    },
  },
};

export const INDUSTRY_KEYS = Object.keys(INDUSTRIES);

// Full field list for a dataset, common fields first.
export function fieldsFor(key) {
  return [...COMMON_FIELDS, ...INDUSTRIES[key].fields];
}
