// Mock CRM dataset.
//
// Four fields per record, looked up by phone number. Add a field here and it
// flows straight through both endpoints — nothing in api.mjs enumerates them.

export const BRAND = "Mock CRM";
export const CURRENCY = "SAR";

export const CUSTOMERS = [
  { id: 1,  phoneNumber: "+966501234001", firstName: "Ahmed",  accountNumber: "ACC-884101", billAmount: 412.50,  deviceType: "iPhone 16 Pro" },
  { id: 2,  phoneNumber: "+966501234002", firstName: "Sara",   accountNumber: "ACC-884102", billAmount: 0.00,    deviceType: "Samsung Galaxy A55" },
  { id: 3,  phoneNumber: "+966501234003", firstName: "John",   accountNumber: "ACC-884103", billAmount: 1240.00, deviceType: "Google Pixel 8a" },
  { id: 4,  phoneNumber: "+966501234004", firstName: "Fatima", accountNumber: "ACC-884104", billAmount: 249.00,  deviceType: "iPhone 15" },
  { id: 5,  phoneNumber: "+966501234005", firstName: "Rajesh", accountNumber: "ACC-884105", billAmount: 0.00,    deviceType: "OnePlus 12" },
  { id: 6,  phoneNumber: "+966501234006", firstName: "Layla",  accountNumber: "ACC-884106", billAmount: 129.00,  deviceType: "iPhone 12" },
  { id: 7,  phoneNumber: "+966501234007", firstName: "Omar",   accountNumber: "ACC-884107", billAmount: 2450.00, deviceType: "Business Fleet Router" },
  { id: 8,  phoneNumber: "+966501234008", firstName: "Mei",    accountNumber: "ACC-884108", billAmount: 0.00,    deviceType: "iPhone 16" },
  { id: 9,  phoneNumber: "+966501234009", firstName: "David",  accountNumber: "ACC-884109", billAmount: 872.40,  deviceType: "iPhone 15 Pro Max" },
  { id: 10, phoneNumber: "+966501234010", firstName: "Noura",  accountNumber: "ACC-884110", billAmount: 0.00,    deviceType: "Samsung Galaxy S24" },
  { id: 11, phoneNumber: "+966501234011", firstName: "Tom",    accountNumber: "ACC-884111", billAmount: 389.00,  deviceType: "Fibre Router X2" },
  { id: 12, phoneNumber: "+966501234012", firstName: "Aisha",  accountNumber: "ACC-884112", billAmount: 129.00,  deviceType: "iPhone 13" },
];

// The fields a caller record exposes, in display order. The console page and
// the generated Genesys contract both read this, so adding a field to the
// records above and naming it here is the whole job.
export const FIELDS = [
  { name: "id",            type: "integer", note: "Record id (mockapi.io convention)" },
  { name: "phoneNumber",   type: "string",  note: "Lookup key. E.164." },
  { name: "firstName",     type: "string",  note: "Caller's first name — greet with this." },
  { name: "accountNumber", type: "string",  note: "Account reference." },
  { name: "billAmount",    type: "number",  note: `Outstanding bill in ${CURRENCY}.` },
  { name: "deviceType",    type: "string",  note: "Handset or CPE model." },
];
