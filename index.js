const express = require("express");
const app = express();
const dotenv = require("dotenv");
const cors = require("cors");
const port = process.env.NEXT_PUBLIC_BASE_URL || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
dotenv.config();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World");
});

const uri = process.env.MONGODB_URI;

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
    await client.connect();

    const database = client.db(process.env.MONGO_CLIENT_DB);
    const jobCollection = database.collection("jobs");
    const companyCollection = database.collection("companies");
    const userCollection = database.collection("user");
    const applicationsCollection = database.collection("applications");
    const plansCollection = database.collection("plans");
    const subscriptionsCollection = database.collection("subscriptions");
    const sessionCollection = database.collection("session");

    // verification related
    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers?.authorization;

      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = authHeader.split(" ")[1];

      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const query = { token: token };
      const session = await sessionCollection.findOne(query);

      if (!session) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const userId = session.userId;

      const userQuery = {
        _id: userId,
      };

      const user = await userCollection.findOne(userQuery);
      if (!user) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      //set data in the req object
      req.user = user;
      next();
    };

    // must be used after verifyToken middleware
    const verifySeeker = async (req, res, next) => {
      if (req.user?.role !== "seeker") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // must be used after verifyToken middleware
    const verifyAdmin = async (req, res, next) => {
      if (req.user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // must be used after verifyToken middleware
    const verifyRecruiter = async (req, res, next) => {
      if (req.user.role !== "recruiter") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // jobs related apis
    app.get("/api/jobs", async (req, res) => {
      const query = {};
      if (req.query.companyId) {
        query.companyId = req.query.companyId;
      }
      if (req.query.status) {
        query.status = req.query.status;
      }
      const cursor = jobCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/api/jobs/:id", async (req, res) => {
      const id = req.params;
      const result = await jobCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.post("/api/jobs", async (req, res) => {
      const job = req.body;
      const newJob = {
        ...job,
        createdAt: new Date(),
      };
      const result = await jobCollection.insertOne(newJob);
      res.send(result);
    });

    // applications related apis

    app.get(
      "/api/applications",
      verifyToken,
      verifySeeker,
      async (req, res) => {
        const query = {};
        if (req.query.applicantId) {
          query.applicantId = req.query.applicantId;

          // check whether asking for user information or someone else
          console.log(req.user, req.query.applicantId);
          if (req.user._id.toString() !== req.query.applicantId) {
            return res.status(403).send({ message: "forbidden access" });
          }
        }
        if (req.query.jobId) {
          query.jobId = req.query.jobId;
        }

        const cursor = applicationsCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      },
    );

    app.post("/api/applications", async (req, res) => {
      const application = req.body;
      const newApplication = {
        ...application,
        createdAt: new Date(),
      };
      const result = await applicationsCollection.insertOne(newApplication);
      res.send(result);
    });

    // Company related apis

    // app.get("/api/companies", async (req, res) => {
    //   const cursor = companyCollection.find();
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    // inefficient way to join/aggregate collection
    app.get("/api/companies", verifyToken, verifyAdmin, async (req, res) => {
      const cursor = companyCollection.find().sort({ createdAt: -1 });
      const companies = await cursor.toArray();

      for (const company of companies) {
        const filter = {
          companyId: company._id.toString(),
        };
        const jobCount = await jobCollection.countDocuments(filter);
        company.jobCount = jobCount;
      }

      res.send(companies);
    });

    // inefficient way to join/aggregate collection
    app.get("/api/companies2", async (req, res) => {
      const pipeline = [
        {
          $skip: 5,
        },
        {
          $limit: 2,
        },
      ];
      const cursor = companyCollection.aggregate(pipeline);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/api/stats", async (req, res) => {
      const pipeline = [
        {
          $group: {
            _id: "$jobType",
            count: {
              $sum: 1,
            },
          },
        },
        {
          $project: {
            jobType: "$_id",
            _id: 0,
            count: 1,
          },
        },
        {
          $sort: { count: -1 },
        },
      ];

      const cursor = jobCollection.aggregate(pipeline);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/api/my/companies", async (req, res) => {
      const query = {};
      if (req.query.recruiterId) {
        query.recruiterId = req.query.recruiterId;
      }
      const result = await companyCollection.findOne(query);

      res.send(result || {});
    });

    app.post("/api/companies", async (req, res) => {
      const company = req.body;
      const newCompany = {
        ...company,
        createdAt: new Date(),
      };
      const result = await companyCollection.insertOne(newCompany);
      res.send(result);
    });

    app.patch(
      "/api/companies/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const updatedCompany = req.body;
        const result = await companyCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedCompany },
        );
        res.send(result);
      },
    );

    // plans

    app.get("/api/plans", async (req, res) => {
      const query = {};
      if (req.query.planId) {
        query.plan = req.query.planId;
      }

      const plan = await plansCollection.findOne(query);

      res.send(plan);
    });

    // subscriptions
    app.post("/api/subscriptions", async (req, res) => {
      const data = req.body;
      const subsInfo = {
        ...data,
        createdAt: new Date(),
      };

      const result = await subscriptionsCollection.insertOne(subsInfo);

      // update the user plan information
      const filter = { email: data.email };
      const updatePlan = {
        $set: {
          plan: data.planId,
        },
      };

      const updateResult = await userCollection.updateOne(filter, updatePlan);

      res.send(updateResult);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
