import Customer from "../schemas/Customer.js";

const formatCustomer = (customer) => ({
  id: customer._id,
  customerId: customer.customerId,
  name: customer.name,
  email: customer.email,
  mobile: customer.mobile,
  profileImage: customer.profileImage,
});

// GET /api/customer/profile
export const getProfile = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res
      .status(200)
      .json({ success: true, customer: formatCustomer(customer) });
  } catch (error) {
    console.error("Get Profile Error:", error);

    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// PUT /api/customer/profile   body: { name?, mobile? }
// Email is not editable here (it is the login identity and is verified by Google).
export const updateProfile = async (req, res) => {
  try {
    const { name, mobile } = req.body;

    if (name === undefined && mobile === undefined) {
      return res.status(400).json({
        success: false,
        message: "Nothing to update",
      });
    }

    const customer = await Customer.findById(req.customer.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (name !== undefined) {
      const cleanName = String(name).trim();

      if (cleanName.length < 2) {
        return res.status(400).json({
          success: false,
          message: "Name must be at least 2 characters",
        });
      }

      customer.name = cleanName;
    }

    if (mobile !== undefined) {
      const cleanMobile = String(mobile).trim();

      if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
        return res.status(400).json({
          success: false,
          message: "Enter a valid 10-digit mobile number",
        });
      }

      const taken = await Customer.findOne({
        mobile: cleanMobile,
        _id: { $ne: customer._id },
      });

      if (taken) {
        return res.status(409).json({
          success: false,
          message: "This mobile number is already in use",
        });
      }

      customer.mobile = cleanMobile;
    }

    await customer.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated",
      customer: formatCustomer(customer),
    });
  } catch (error) {
    console.error("Update Profile Error:", error);

    return res.status(500).json({ success: false, message: "Server error" });
  }
};
