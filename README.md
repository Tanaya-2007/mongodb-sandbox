# MongoDB Sandbox Provisioner 🚀

An instant, isolated, and developer-first cloud database provisioning tool for MERN stack applications. 

With a single terminal command, `mongo-sandbox` registers your project, provisions an isolated MongoDB database in the cloud, injects the connection string into your local `.env` file, and provides a responsive dark-mode browser dashboard to visualize and manage your data.

---

## 🌟 Features

* **Zero Local Setup**: Bypass downloading MongoDB Compass or installing community servers. Get a live cloud database in 5 seconds.
* **Smart Isolation**: Automatically hashes project directory paths to ensure separate environments. If you run the command in the same folder, you get the same database (idempotency).
* **Least-Privilege Security**: Sandbox database credentials use a restricted database user with `readWriteAnyDatabase` privileges. Your master cluster credentials remain 100% private.
* **Responsive Web Visualizer**: An interactive web dashboard to browse collections, expand/collapse document JSON payloads, delete records, or clear entire collections in real-time.
* **Persistent `.env` Injection**: Programmatically updates your local `.env` file and appends the Visualizer URL as a comment right above the `MONGODB_URI` string for permanent reference.

---

## 📦 Installation & Usage

No global installation is required! Simply run the tool using `npx` inside the root of your Node.js/Express project:

```bash
npx mongo-sandbox
```

### What happens next?
1. The CLI computes a unique fingerprint for your project directory.
2. It requests a new sandbox from the central provisioner server.
3. Your local `.env` file is updated:
   ```env
   # MongoDB Sandbox Visualizer: https://mongodb-sandbox.onrender.com/sandbox/sandbox_dev_a1b2c3d4
   MONGODB_URI=mongodb+srv://sandbox_developer:oHVD1SJnQhwGFjc3@cluster0.zdwbu4z.mongodb.net/sandbox_dev_a1b2c3d4?retryWrites=true&w=majority
   ```
4. Connect to the database inside your Node.js application:
   ```javascript
   const mongoose = require('mongoose');
   
   mongoose.connect(process.env.MONGODB_URI)
     .then(() => console.log('Connected to MongoDB Sandbox!'));
   ```

---

## 🗺️ System Architecture

```
[Developer Terminal] ---> [Render Provisioner Server] ---> [MongoDB Atlas Cloud]
        |                               ^                           |
        | (Injects .env URI)            | (Hosts Visualizer UI)     | (Connects App)
        v                               |                           v
   [.env File] ------------------> [Web Browser Dashboard] ----> [Isolated Sandbox]
```

1. **CLI Client**: Computes the project fingerprint and queries the backend.
2. **Express Server (Backend)**: Manages device-to-database registration mappings and dynamically routes database traffic.
3. **Web Dashboard (Frontend)**: Displays document lists, supports expand/collapse JSON cards, and handles document deletions.

---

## ⚙️ Running the Provisioner Server Locally

If you want to host your own provisioner server backend:

1. Clone the repository and navigate to the `server/` directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file inside the `server/` folder:
   ```env
   PORT=5000
   MONGODB_ATLAS_URI="your_mongodb_cluster_connection_uri"
   SANDBOX_DB_USER="sandbox_developer"
   SANDBOX_DB_PASSWORD="your_database_user_password"
   ```
4. Start the server:
   ```bash
   npm run dev
   ```

---

## 📄 License

Distributed under the ISC License. See `LICENSE` for more information.
