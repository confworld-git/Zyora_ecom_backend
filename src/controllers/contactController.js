import mongoose from "mongoose";
import Contact from "../schemas/Contact.js";
import { sendEmail } from "../utils/emailService.js";
import enquiryAdminAlertTemplate from "../utils/enquiryAdminAlertTemplate.js";
import enquiryReplyTemplate from "../utils/enquiryReplyTemplate.js";

const ORDER_RELATED_ENQUIRY_TYPES = new Set([
  "Order Status / Tracking",
  "Order Cancellation",
  "Return or Exchange",
  "Refund Status",
  "Payment Issue",
  "Damaged or Defective Product",
  "Delivery / Shipping Issue",
]);

export const createContact = async (req, res) => {
  try {
    const { name, email, phone, enquiryType, message } = req.body;
    const submittedOrderId = req.body.orderId ?? req.body.OrderID;
    const orderId =
      typeof submittedOrderId === "string" ? submittedOrderId.trim() : "";
    if (!name || !email || !phone || !enquiryType || !message) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    if (ORDER_RELATED_ENQUIRY_TYPES.has(enquiryType) && !orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required for order-related enquiries"
      });
    }

    const contact = await Contact.create({
      name,
      email,
      phone,
      enquiryType,
      orderId: ORDER_RELATED_ENQUIRY_TYPES.has(enquiryType)
        ? orderId
        : undefined,
      message
    });

    let adminAlertSent = false;
    try {
      if (!process.env.ADMIN_EMAIL) {
        throw new Error("ADMIN_EMAIL is not set");
      }

      const { subject, html, text } = enquiryAdminAlertTemplate(contact);

      await sendEmail({
        to: process.env.ADMIN_EMAIL,
        replyTo: contact.email,
        subject,
        html,
        text,
      });
      adminAlertSent = true;
    } catch (emailError) {
      console.error("Contact admin alert email failed:", emailError);
    }

    let responseMessage = "Message sent successfully. A confirmation email has been sent.";
    let emailSent = true;
    try {
      await sendEmail({
        to: contact.email,
        subject: "We received your enquiry – ZYORA",
        html: enquiryReplyTemplate(contact),
      });
    } catch (emailError) {
      console.error("Contact confirmation email failed:", emailError);
      emailSent = false;
      responseMessage =
        "Your enquiry was received, but we couldn't send the confirmation email.";
    }

    res.status(201).json({
      success: true,
      emailSent,
      adminAlertSent,
      message: responseMessage,
      data: contact
    });

  } catch (error) {
    console.error("Create contact error:", error);

    res.status(500).json({
      success: false,
      message: "Something went wrong"
    });
  }
};


export const getContacts = async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: contacts.length,
      data: contacts
    });

  } catch (error) {
    console.error("Get contacts error:", error);

    res.status(500).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

export const deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid enquiry id" });
    }

    const contact = await Contact.findByIdAndDelete(id);
    if (!contact) {
      return res
        .status(404)
        .json({ success: false, message: "Enquiry not found" });
    }

    return res
      .status(200)
      .json({ success: true, message: "Enquiry deleted successfully" });
  } catch (error) {
    console.error("Delete contact error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete enquiry" });
  }
};