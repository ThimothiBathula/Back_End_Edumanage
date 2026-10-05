const axios = require("axios");

const sendSMS = async (phone, variables) => {
  try {

    const res = await axios.post(
      "https://api.msg91.com/api/v5/flow/",
      {
        flow_id: process.env.MSG91_FLOW_ID,
        sender: "SCHAPP",                 // keep consistent with DLT
        mobiles: `91${phone}`,

        // 🔥 THIS IS IMPORTANT
        ...variables                      // { name: "Rahul" }
      },
      {
        headers: {
          authkey: process.env.MSG91_API_KEY,
          "Content-Type": "application/json"
        },
        timeout: 5000
      }
    );

    console.log(`📩 SMS sent to ${phone}`);

    return { success: true, data: res.data };

  } catch (err) {
    console.error("SMS Error:", err.response?.data || err.message);

    return { success: false };
  }
};

module.exports = sendSMS;