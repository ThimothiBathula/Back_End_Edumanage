const mockSMS = require("./mockSMS");
const msg91SMS = require("./msg91SMS");

function getProvider() {
  const p = (process.env.SMS_PROVIDER || "mock").toLowerCase();
  return p === "msg91" ? msg91SMS : mockSMS;
}

const provider = getProvider();

module.exports = (phone, variables) => provider(phone, variables);