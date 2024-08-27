const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
app.use(cors());
app.use(express.json());
const nodemailer = require("nodemailer");

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iulixph.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

let transporter = nodemailer.createTransport({
  host: "smtp.example.com", // Replace with your SMTP server
  port: 587, // Replace with the appropriate port
  secure: false, // true for 465, false for other ports
  auth: {
    user: "your-email@example.com", // Replace with your email address
    pass: "your-email-password", // Replace with your email password
  },
});

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection

    const menuCollection = client.db("Bistro-BossDB").collection("menuDB");
    const usersCollection = client.db("Bistro-BossDB").collection("usersDB");
    const reviewCollection = client.db("Bistro-BossDB").collection("reviewsDB");
    const cartCollection = client.db("Bistro-BossDB").collection("cartsDB");
    const paymentsCollection = client
      .db("Bistro-BossDB")
      .collection("paymentsDB");
    const ordersCollection = client.db("Bistro-BossDB").collection("ordersDB");

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });
      res.send({ token });
    });

    const verifyToken = (req, res, next) => {
      console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        res.status(401).send({ message: "unauthorized" });
      }
      const token = req.headers.authorization?.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // verify admin here

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    app.get("/payment-history", verifyToken, async (req, res) => {
      const email = req.query.email;
      const userEmail = req.decoded.email;

      if (email !== userEmail) {
        res.status(403).send("forbidden access");
      }

      const query = {
        email: email,
      };
      const result = await paymentsCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/all-menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    app.get("/all-payments", verifyToken, verifyAdmin, async (req, res) => {
      const result = await paymentsCollection.find().toArray();
      res.send(result);
    });

    app.get("/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      tokenEmail = req.decoded.email;
      if (email !== tokenEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);

      res.send(user);
    });

    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    app.get("/user-cart", verifyToken, async (req, res) => {
      const email = req.query.email;
      tokenEmail = req.decoded.email;
      if (email !== tokenEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = {
        userEmail: email,
      };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const cartData = req.body;
      const result = await cartCollection.insertOne(cartData);
      const orders = await ordersCollection.insertOne(cartData);
      res.send(result);
    });

    app.get("/all-orders", verifyToken, verifyAdmin, async (req, res) => {
      const result = await ordersCollection.find().toArray();
      res.send(result);
    });

    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const menuData = req.body;
      const result = await menuCollection.insertOne(menuData);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const usersData = req.body;
      const query = {
        email: usersData.email,
      };

      const isExists = await usersCollection.findOne(query);
      if (isExists) {
        return res.send({ message: "user already exist", insertedId: null });
      }
      const result = await usersCollection.insertOne(usersData);
      res.send(result);
    });

    app.get("/menu/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.findOne(query);
      res.send(result);
    });

    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    });

    // update menu data
    app.patch("/item/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const itemData = req.body;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...itemData,
        },
      };
      const result = await menuCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    app.patch("/user/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete("/user/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    // payment intent

    app.post("/create-checkout-session", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", async (req, res) => {
      const paymentsData = req.body;
      console.log(paymentsData);
      const paymentResult = await paymentsCollection.insertOne(paymentsData);

      const query = {
        _id: {
          $in: paymentsData.cartId.map((id) => new ObjectId(id)),
        },
      };

      const deleteResult = await cartCollection.deleteMany(query);
      res.send({ paymentResult, deleteResult });
    });

    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await ordersCollection.estimatedDocumentCount();
      // const payments = await paymentsCollection.find().toArray();
      // const revenue = payments.reduce((total, item) => total + item.price, 0)

      const result = await paymentsCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: "$price",
              },
            },
          },
        ])
        .toArray();
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;
      res.send({ users, menuItems, orders, revenue });
    });

    app.get("/order-stats", async (req, res) => {
      const result = await paymentsCollection
        .aggregate([
          // Unwind the menuItemIds array to work with each menu item individually
          { $unwind: "$menuIds" },

          // Lookup to join the menu collection
          {
            $lookup: {
              from: "menuDB",
              localField: "menuIds",
              foreignField: "menuId",
              as: "menuDetails",
            },
          },

          {
            $unwind: "$menuDetails",
          },
          {
            $group: {
              _id: "$menuDetails.category",
              quantity: { $sum: 1 },
              revenue: { $sum: "$menuDetails.price" },
            },
          },
          {
            $project: {
              _id: 0,
              category: "$_id",
              quantity: "$quantity",
              revenue: "$revenue",
            },
          },
        ])
        .toArray();

      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Bistro Boss is sitting");
});

app.listen(port, () => {
  console.log(`Bistro Boss is sitting ${port}`);
});
