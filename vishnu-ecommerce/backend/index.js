const express = require("express");
const mongoose = require("mongoose");
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const app = express();
const User = require('./db/User'); 
const Product = require('./db/Product');
const Cart = require('./db/Cart');  // Assuming you've created a Cart model
require('./db/config');

// Middleware
app.use(cors());
app.use(express.json());

// Test Route
app.get("/test", (req, res) => {
    res.send("Test route is working!");
});

// Register Route
app.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Invalid email address'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('phoneNumber').isMobilePhone().withMessage('Invalid phone number'),
  body('address').trim().notEmpty().withMessage('Address is required'),
  body('isAdmin').isBoolean().withMessage('isAdmin must be a boolean'),
  body('adminCode').if(body('isAdmin').equals('true')).notEmpty().withMessage('Admin code is required for admin registration')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, phoneNumber, address, isAdmin, adminCode } = req.body;

    // Check if the email already exists in the database
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use" });
    }

    // If registering as admin, validate the admin code
    if (isAdmin) {
      const validAdminCode = process.env.ADMIN_CODE || "271103"; // Store this securely in an environment variable
      if (adminCode !== validAdminCode) {
        return res.status(400).json({ error: "Invalid admin code" });
      }
    }

    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create and save the new user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      phoneNumber,
      address,
      isAdmin
    });

    const savedUser = await newUser.save();

    // Remove sensitive information before sending the response
    const userResponse = savedUser.toObject();
    delete userResponse.password;

    res.status(201).json(userResponse);
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({ error: "Error saving user" });
  }
});

// Login Route
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    // Validate the input
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    try {
        // Find the user by email
        let user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: "No user found" });
        }
        // Check if the password is correct
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Invalid password" });
        }

        // Remove the password before sending the response
        user = user.toObject();
        delete user.password;
        res.status(200).json(user);
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ error: "Error logging in user" });
    }
});

// Add Product Route
app.post('/addproduct', async (req, res) => {
  const { name, price, category, description, quantity, userId } = req.body;

  // Check for required fields
  if (!name || !price || !category || !description || !quantity || !userId) {
      return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
      const newProduct = new Product({ name, price, category, description, quantity, userId });
      await newProduct.save();
      return res.status(201).json({ message: 'Product added successfully!', product: newProduct });
  } catch (error) {
      console.error('Error adding product:', error);
      return res.status(500).json({ message: 'Error adding product' });
  }
});

// Get Products Route
app.get("/product", async (req, res) => {
    try {
        let products = await Product.find();
        if (products.length > 0) {
            res.status(200).json(products);
        } else {
            res.status(404).json({ message: "No products found" });
        }
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ error: "Error retrieving products" });
    }
});

app.delete("/product/:id", async (req, res) => {
  try {
      const result = await Product.deleteOne({ _id: req.params.id });
      if (result.deletedCount === 1) {
          res.status(200).json({ message: "Product deleted successfully" });
      } else {
          res.status(404).json({ error: "Product not found" });
      }
  } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ error: "An error occurred while deleting the product" });
  }
});

// Add item to cart (Updated version)
app.post('/add-to-cart', async (req, res) => {
  try {
      const { userId, productId } = req.body;
      
      if (!userId || !productId) {
          return res.status(400).json({ success: false, message: 'userId and productId are required.' });
      }
      
      // Find the product by its ID
      const product = await Product.findById(productId);
      if (!product) {
          return res.status(404).json({ success: false, message: 'Product not found.' });
      }

      // Check if product is available
      if (product.quantity > 0) {
          // Find the user's cart or create a new one
          let cart = await Cart.findOne({ userId });
          if (!cart) {
              cart = new Cart({ userId, items: [] });
          }

          // Check if the product is already in the cart
          const cartItem = cart.items.find(item => item.productId.toString() === productId);
          if (cartItem) {
              cartItem.quantity += 1;
          } else {
              cart.items.push({ productId, quantity: 1 });
          }

          await cart.save();

          // Decrease the product stock
          product.quantity -= 1;
          await product.save();

          res.status(200).json({ success: true, message: 'Product added to cart and stock updated.' });
      } else {
          res.status(400).json({ success: false, message: 'Product is out of stock.' });
      }
  } catch (error) {
      console.error('Error adding to cart:', error);
      res.status(500).json({ success: false, message: 'An error occurred while adding to cart.' });
  }
});

// Get cart items
app.get('/cart/:userId', async (req, res) => {
  try {
      const { userId } = req.params;
      const cart = await Cart.findOne({ userId }).populate('items.productId');
      if (!cart) {
          return res.status(404).json({ message: 'Cart not found' });
      }
      res.status(200).json(cart);
  } catch (error) {
      console.error('Error fetching cart:', error);
      res.status(500).json({ message: 'An error occurred while fetching the cart' });
  }
});

// Remove item from cart
app.post('/api/cart/remove', async (req, res) => {
  try {
      const { userId, productId } = req.body;
      const cart = await Cart.findOne({ userId });
      if (!cart) {
          return res.status(404).json({ message: 'Cart not found' });
      }

      // Find the item in the cart
      const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
      if (itemIndex > -1) {
          const item = cart.items[itemIndex];
          // Remove the item from the cart
          cart.items.splice(itemIndex, 1);
          await cart.save();

          // Increase the product stock
          const product = await Product.findById(productId);
          product.quantity += item.quantity;
          await product.save();

          res.status(200).json({ message: 'Item removed from cart and stock updated' });
      } else {
          res.status(404).json({ message: 'Item not found in cart' });
      }
  } catch (error) {
      console.error('Error removing item from cart:', error);
      res.status(500).json({ message: 'An error occurred while removing the item from cart' });
  }
});

app.get("/search/:key", async (req, res) => {
  try {
      let result = await Product.find({
          "$or": [
              { name: { $regex: req.params.key, $options: "i" } },
              { category: { $regex: req.params.key, $options: "i" } }
          ]
      });

      // Check if products are found
      if (result.length > 0) {
          res.status(200).json(result);
      } else {
          res.status(404).json({ message: "No products found" });
      }
  } catch (error) {
      console.error("Error during search:", error);
      res.status(500).json({ error: "An error occurred while searching for products" });
  }
});

// Start Server
app.listen(5000, () => {
    console.log("Server is running on port 5000");
});