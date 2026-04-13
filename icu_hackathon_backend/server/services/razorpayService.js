const crypto = require("node:crypto");
const axios = require("axios");

const DEFAULT_RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

function hasPlaceholderValue(value) {
  return /^your[_-]/i.test(String(value || "").trim());
}

function readConfiguredEnvValue(...keys) {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value && !hasPlaceholderValue(value)) {
      return value;
    }
  }

  return "";
}

function getRazorpayKeyId() {
  return readConfiguredEnvValue(
    "RAZORPAY_KEY_ID",
    "RAZORPAY_TEST_KEY_ID",
    "NEXT_PUBLIC_RAZORPAY_KEY_ID"
  );
}

function getRazorpayKeySecret() {
  return readConfiguredEnvValue("RAZORPAY_KEY_SECRET", "RAZORPAY_TEST_KEY_SECRET");
}

function getRazorpayApiBase() {
  return readConfiguredEnvValue("RAZORPAY_API_BASE_URL") || DEFAULT_RAZORPAY_API_BASE;
}

function isRazorpayConfigured() {
  return Boolean(getRazorpayKeyId() && getRazorpayKeySecret());
}

function ensureRazorpayConfigured() {
  if (!isRazorpayConfigured()) {
    throw new Error(
      "Razorpay test credentials are missing. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env."
    );
  }
}

function getPublicKeyId() {
  ensureRazorpayConfigured();
  return getRazorpayKeyId();
}

function buildAuthorizationHeader() {
  ensureRazorpayConfigured();
  const credentials = `${getRazorpayKeyId()}:${getRazorpayKeySecret()}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

function normalizeRazorpayError(error, fallbackMessage) {
  const responseMessage = String(
    error?.response?.data?.error?.description ||
      error?.response?.data?.error?.reason ||
      error?.response?.data?.error?.field ||
      error?.response?.data?.error?.code ||
      ""
  ).trim();

  if (responseMessage) {
    return responseMessage;
  }

  const message = String(error?.message || "").trim();
  return message || fallbackMessage;
}

async function razorpayRequest(method, path, data) {
  try {
    const response = await axios({
      method,
      url: `${getRazorpayApiBase().replace(/\/+$/, "")}${path}`,
      headers: {
        Authorization: buildAuthorizationHeader(),
        "Content-Type": "application/json",
      },
      data,
      timeout: 10000,
    });

    return response.data;
  } catch (error) {
    throw new Error(normalizeRazorpayError(error, `Razorpay request failed for ${path}`));
  }
}

function normalizeTrimmed(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }

  return normalized;
}

async function createOrder({ amountSubunits, currency, receipt, notes } = {}) {
  const normalizedCurrency = normalizeTrimmed(currency, "currency").toUpperCase();
  const normalizedReceipt = normalizeTrimmed(receipt, "receipt");
  const normalizedAmount = Number(amountSubunits);

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error("amountSubunits must be a positive number");
  }

  return razorpayRequest("post", "/orders", {
    amount: Math.round(normalizedAmount),
    currency: normalizedCurrency,
    receipt: normalizedReceipt,
    notes: notes && typeof notes === "object" ? notes : {},
  });
}

async function fetchOrder(orderId) {
  const normalizedOrderId = normalizeTrimmed(orderId, "orderId");
  return razorpayRequest("get", `/orders/${encodeURIComponent(normalizedOrderId)}`);
}

async function fetchPayment(paymentId) {
  const normalizedPaymentId = normalizeTrimmed(paymentId, "paymentId");
  return razorpayRequest("get", `/payments/${encodeURIComponent(normalizedPaymentId)}`);
}

function verifyPaymentSignature({ orderId, paymentId, signature } = {}) {
  const normalizedOrderId = normalizeTrimmed(orderId, "orderId");
  const normalizedPaymentId = normalizeTrimmed(paymentId, "paymentId");
  const normalizedSignature = normalizeTrimmed(signature, "signature");

  ensureRazorpayConfigured();

  const generatedSignature = crypto
    .createHmac("sha256", getRazorpayKeySecret())
    .update(`${normalizedOrderId}|${normalizedPaymentId}`)
    .digest("hex");

  const generatedBuffer = Buffer.from(generatedSignature);
  const providedBuffer = Buffer.from(normalizedSignature);

  if (
    generatedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(generatedBuffer, providedBuffer)
  ) {
    throw new Error("Razorpay payment signature verification failed");
  }

  return true;
}

module.exports = {
  createOrder,
  fetchOrder,
  fetchPayment,
  getPublicKeyId,
  isRazorpayConfigured,
  verifyPaymentSignature,
};
