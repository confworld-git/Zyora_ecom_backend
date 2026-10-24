import MarkettingMail from "../schemas/MarkettingMail.js";

export const joinNewsletter = async (req, res) => {
  const submittedEmail = req.body?.email;

  if (typeof submittedEmail !== "string") {
    return res.status(400).json({
      success: false,
      message: "A valid email address is required",
    });
  }

  const email = submittedEmail.trim().toLowerCase();

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid email address is required",
    });
  }

  try {
    await MarkettingMail.updateOne(
      { email },
      { $setOnInsert: { email } },
      { upsert: true, runValidators: true },
    );

    return res.status(200).json({
      success: true,
      message: "Thanks for joining our newsletter!",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({
        success: true,
        message: "This email is already subscribed.",
      });
    }

    console.error("Join newsletter error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to join the newsletter. Please try again.",
    });
  }
};
