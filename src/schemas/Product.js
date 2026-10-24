import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    subcategory: {
      type: String,
      default: "",
      trim: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    brand: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      currency: {
        type: String,
        default: "INR",
      },
      mrp: {
        type: Number,
        required: true,
      },
      selling_price: {
        type: Number,
        required: true,
      },
      discount_percent: {
        type: Number,
        default: 0,
      },
    },

    images: [
      {
        id: {
          type: String,
          required: true,
        },

        url: {
          type: String,
          required: true,
        },

        color: {
          type: String,
          default: null,
          trim: true,
        },

        alt: {
          type: String,
          required: true,
          trim: true,
        },
      },
    ],
    video: {
      type: String,
      default: "",
      trim: true,
    },

    about_this_item: [
      {
        type: String,
        trim: true,
      },
    ],

    product_information: {
      features_specs: {
        type: Map,
        of: String,
        default: {},
      },

      style: {
        type: Map,
        of: String,
        default: {},
      },

      measurements: {
        type: Map,
        of: String,
        default: {},
      },

      materials_care: {
        type: Map,
        of: String,
        default: {},
      },

      item_details: {
        type: Map,
        of: String,
        default: {},
      },
    },

    variants: {
      colours: [
        {
          type: String,
          trim: true,
        },
      ],

      sizes: [
        {
          type: String,
          trim: true,
        },
      ],
      colorStock: [
        {
          _id: false,
          color: { type: String, required: true, trim: true },
          quantity: {
            type: Number,
            required: true,
            min: 0,
            validate: Number.isInteger,
          },
          enabled: { type: Boolean, default: true },
        },
      ],
    },

    stock: {
      in_stock: {
        type: Boolean,
        default: true,
      },

      quantity: {
        type: Number,
        default: 0,
        min: 0,
        validate: Number.isInteger,
      },
    },
    rating: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      count: {
        type: Number,
        default: 0,
        min: 0,
        validate: Number.isInteger,
      },
    },
    is_best_seller: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

const Product = mongoose.model("Product", productSchema);

export default Product;
