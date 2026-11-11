const express = require("express");
const cors = require("cors");
const mysql = require('mysql2'); 
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');
const multer = require("multer");
const bcrypt = require("bcrypt");
const path = require('path');
const router = express.Router();
const { sendOTP } = require("./emailService");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/upload", express.static("upload"));
app.use("/upload", express.static(path.join(__dirname, "upload")));



// ================= MULTER STORAGE SETUP =================
const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, "upload/"); },
  filename: (req, file, cb) => { cb(null, Date.now() + "-" + file.originalname); },
});
const upload = multer({ storage: storage });

// ================= MYSQL CONNECTION =================
const db = mysql.createPool({
  host: "127.0.0.1",
  user: "root",
  password: "1234",
  database: "practice_db",
});

db.getConnection((err) => {
  if (err) {
    console.log("Database connection failed ❌", err);
  } else {
    console.log("MySQL Connected ✅");
  }
});


const cleanDateFormat = (dateStr) => {
  if (!dateStr || dateStr === "null") return "-";
  
  if (String(dateStr).includes("GMT") || String(dateStr).includes("Standard Time")) {
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
      }
    } catch (e) { return dateStr; }
  }
  
  if (String(dateStr).includes("-") && String(dateStr).split("-")[0].length === 4) {
    const parts = dateStr.split("-");
    return `${parts[2]}-${parts[1]}-${parts[0]}`; 
  }

  return dateStr;
};
app.get('/api/generate-pdf/:id', async (req, res) => {
  let browser;
  try {
    const userId = req.params.id;

    // 1. DATABASE QUERY
    const [rows] = await db.promise().query('SELECT * FROM users WHERE id = ?', [userId]);
    const user = rows[0];

    if (!user) {
      return res.status(404).json({ message: "User not found in database" });
    }

    // 2. DOB FIX: MySQL Date Handling
    const rawDob = user.dob || user.date_of_birth;
    let userDob = 'N/A';
    if (rawDob) {
      const parsedDate = new Date(rawDob);
      if (!isNaN(parsedDate.getTime())) {
        userDob = parsedDate.toISOString().split('T')[0];
      } else {
        userDob = String(rawDob).split('T')[0];
      }
    }

    const userSkills = Array.isArray(user.skills)
      ? user.skills.join(', ')
      : (user.skills || 'N/A');

    const userLanguages = Array.isArray(user.languages || user.language)
      ? (user.languages || user.language).join(', ')
      : (user.languages || user.language || 'N/A');

    // 3. LOGO BASE64 FIX
    const logoPath = path.join(__dirname, 'assets', 'logo.png');
    let logoSrc = '';
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      logoSrc = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    }

    // 4. HTML LAYOUT WITH CLEAN CSS (No Manual Breaks)
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: Arial, sans-serif; padding: 10px 20px; color: #000; background: #fff; }
            .sheet-container { width: 100%; max-width: 750px; margin: auto; }
            .main-title { text-align: center; font-size: 22px; font-weight: bold; margin-bottom: 20px; }
            .header-meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; page-break-inside: avoid; }
            .meta-line { border-bottom: 1px solid #000; display: inline-block; min-width: 180px; text-align: center; padding-bottom: 2px; }
            
            /* Section Header aur Content Aapas Me Na Katein */
            .section-header { 
              background-color: #555; 
              color: #fff; 
              text-align: center; 
              font-weight: bold; 
              padding: 6px; 
              font-size: 14px; 
              margin: 15px 0; 
              text-transform: uppercase; 
              page-break-after: avoid; 
              break-after: avoid;
            }
            
            /* Every Row block stays intact */
            .field-row { 
              display: flex; 
              margin-bottom: 12px; 
              font-size: 14px; 
              align-items: flex-end; 
              page-break-inside: avoid; 
              break-inside: avoid;
            }
            
            .field-label { width: 140px; font-weight: bold; }
            .field-value { flex: 1; border-bottom: 1px solid #000; padding-bottom: 2px; padding-left: 5px; }
            
            .grid-2 { 
              display: flex; 
              gap: 20px; 
              page-break-inside: avoid; 
              break-inside: avoid;
            }
            .grid-2 > div { flex: 1; }
          </style>
        </head>
        <body>
          <div class="sheet-container">
            <h1 class="main-title">Users Information Sheet</h1>
            
            <div class="header-meta">
              <div>Company Name: <span class="meta-line">My Application</span></div>
              <div>Date: <span class="meta-line">${new Date().toLocaleDateString()}</span></div>
            </div>

            <div class="section-header">Users Information</div>

            <div class="field-row">
              <div class="field-label">User ID:</div>
              <div class="field-value">${user.id || 'N/A'}</div>
            </div>

            <div class="field-row">
              <div class="field-label">Full Name:</div>
              <div class="field-value">${user.name || 'N/A'}</div>
            </div>

            <div class="grid-2">
              <div class="field-row">
                <div class="field-label">Email:</div>
                <div class="field-value">${user.email || 'N/A'}</div>
              </div>
              <div class="field-row">
                <div class="field-label">Mobile Number:</div>
                <div class="field-value">${user.mobile_number || user.mobile || 'N/A'}</div>
              </div>
            </div>

            <div class="grid-2">
              <div class="field-row">
                <div class="field-label">Status:</div>
                <div class="field-value">${user.status || 'N/A'}</div>
              </div>
              <div class="field-row">
                <div class="field-label">DOB:</div>
                <div class="field-value">${userDob}</div>
              </div>
            </div>

            <div class="field-row">
              <div class="field-label">Gender:</div>
              <div class="field-value">${user.gender || 'N/A'}</div>
            </div>

            <div class="section-header">Additional Profile Details</div>

            <div class="field-row">
              <div class="field-label">Skills:</div>
              <div class="field-value">${userSkills}</div>
            </div>

            <div class="field-row">
              <div class="field-label">Languages:</div>
              <div class="field-value">${userLanguages}</div>
            </div>

            <div class="field-row">
              <div class="field-label">Address:</div>
              <div class="field-value">${user.address || 'N/A'}</div>
            </div>
          </div>
        </body>
      </html>
    `;

    // 5. PUPPETEER LAUNCH
    const uniqueUserDataDir = path.join(os.tmpdir(), `puppeteer_user_data_${Date.now()}`);

    browser = await puppeteer.launch({
      headless: true,
      userDataDir: uniqueUserDataDir,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

    const pdfBuffer = await page.pdf({
  format: 'A4',
  printBackground: true,
  // Header ke liye jagah badhane ke liye top margin 100px kiya hai
  margin: { top: '100px', bottom: '60px', left: '20px', right: '20px' },
  displayHeaderFooter: true,
  
  // 🖼️ UPDATED MEDIUM/LARGE LOGO HEADER TEMPLATE
  headerTemplate: `
    <div style="font-size: 10px; width: 100%; height: 70px; display: flex; justify-content: space-between; align-items: center; padding: 0 35px; font-family: Arial, sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact;">
      ${logoSrc 
        ? `<img src="${logoSrc}" style="height: 55px; width: auto; max-width: 220px; object-fit: contain; display: block;" />` 
        : `<span style="font-weight:bold; font-size:16px; color:#333;">MY APPLICATION</span>`
      }
      <span style="color: #555; font-weight: bold; font-size: 13px;">User Information Sheet</span>
    </div>
  `,
  
  footerTemplate: `
    <div style="font-size: 10px; width: 100%; display: flex; justify-content: space-between; padding: 0 35px; color: #555; font-family: Arial, sans-serif;">
      <span>Generated System Report</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>
  `
});
    res.contentType("application/pdf");
    res.send(pdfBuffer);

  } catch (error) {
    console.error("PDF Error:", error);
    res.status(500).json({ error: "Failed to generate PDF", details: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

// ==========================================
// CENTRAL LOGGER FOR MASTER TABLES

function logMasterActivity(moduleName, actionType, performedBy, description) {
    console.log("=== LOG FUNCTION TRIGGERED ===");
    console.log("Data received:", { moduleName, actionType, performedBy, description });

    const sql = "INSERT INTO activity_logs (module_name, action_type, performed_by, description, timestamp) VALUES (?, ?, ?, ?, NOW())";
    
    if (!db) {
        console.error("❌ Database connection object (db) is missing inside log function!");
        return;
    }

    db.query(sql, [moduleName, actionType, performedBy, description], (err, result) => {
        if (err) {
            console.error("❌ SQL Execution Error inside Activity Log:", err.message);
            return;
        }
        console.log("✅ Activity Log successfully inserted into DB! Row ID:", result.insertId);
    });
}
// ================= AUTOMATIC NO-DUPLICATE LOGGING FUNCTION =================
const logActivity = (name, email, targetEmail, action, status, verified, city, dob, mobile, changesArray, successCallback) => {
  const timeStr = new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).replace(",", " at"); 

  const cleanedChangesArray = (changesArray || []).map(change => {
    let text = String(change);
    if (text.includes("➔")) {
      const parts = text.split("➔");
      let leftSide = parts[0].trim();
      let rightSide = parts[1].trim();

      if (leftSide.toLowerCase().includes("dob")) {
        const label = leftSide.split(":")[0];
        const val = leftSide.split(":")[1] ? leftSide.split(":")[1].trim() : "";
        leftSide = `${label}: ${cleanDateFormat(val)}`;
      }
      rightSide = cleanDateFormat(rightSide);
      return `${leftSide} ➔ ${rightSide}`;
    }
    return text;
  });

  const changesString = JSON.stringify(cleanedChangesArray);
  const verifiedStr = (verified === 1 || verified === "1" || verified === "Yes" || verified === true) ? "Yes" : "No";
  const performerName = name && name.trim() !== "" ? name : "Admin";
  const performerEmail = email && email.trim() !== "" ? email : "admin@mailinator.com";

  const sqlLog = `
    INSERT INTO activity_logs 
    (performer_name, performer_email, target_user_email, action, status, verified, city, dob, mobile, changes, time) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE 
    performer_name = VALUES(performer_name),
    performer_email = VALUES(performer_email),
    action = VALUES(action),
    status = VALUES(status),
    verified = VALUES(verified),
    city = VALUES(city),
    dob = VALUES(dob),
    mobile = VALUES(mobile),
    changes = VALUES(changes),
    time = VALUES(time)
  `;
  
  db.query(sqlLog, [
    performerName, performerEmail, targetEmail, action, status || 'active', 
    verifiedStr, city || null, cleanDateFormat(dob), mobile || null, changesString, timeStr
  ], (err) => {
    if (successCallback) successCallback();
  });
};

// ================= GET USERS =================
app.get("/users", (req, res) => {
  db.query("SELECT * FROM users", (err, result) => {
    if (err) return res.status(500).json({ message: "Fetch error" });
    res.json(result);
  });
});
// ==========================================
// API TO FETCH LOGS BY PAGE NAME
app.get('/api/master-activity-logs/:page_name', (req, res) => {
    const { page_name } = req.params;
    
    const allowedPages = ['Country', 'State', 'City', 'Skills', 'Language'];
    if (!allowedPages.includes(page_name)) {
        return res.status(400).json({ success: false, message: 'Invalid page name parameter!' });
    }

    const sql = 'SELECT * FROM master_activity_logs WHERE page_name = ? ORDER BY id DESC';
    
    db.query(sql, [page_name], (err, results) => {
        if (err) {
            console.error("❌ Error fetching activity logs:", err.message);
            return res.status(500).json({ success: false, error: "Database error", details: err.message });
        }
        res.json({ success: true, logs: results });
    });
});
// ================= DYNAMIC STATUS TOGGLE WITH LOG =================
app.put("/toggle-status/:id", (req, res) => {
  const { status } = req.body;
  const id = req.params.id;

  db.query("SELECT email, name, status, isVerified, city, dob, mobile FROM users WHERE id=?", [id], (err, userResult) => {
    if (err || userResult.length === 0) return res.status(500).send(err);
    const targetUser = userResult[0];

    db.query("UPDATE users SET status=? WHERE id=?", [status, id], (updateErr) => {
      if (updateErr) return res.status(500).send(updateErr);

      const actionText = status === "inactive" ? "Deactivated" : "Activated";
      const changes = [`Status changed to ${status}`];

      logActivity(
        "Admin", 
        "admin@mailinator.com", 
        targetUser.email, 
        actionText, 
        status, 
        targetUser.isVerified,
        targetUser.city,
        targetUser.dob,
        targetUser.mobile, 
        changes, 
        () => { res.send("Status Updated"); }
      );
    });
  });
});

// ================= DYNAMIC VERIFIED TOGGLE WITH LOG =================
app.put("/toggle-verified/:id", (req, res) => {
  const { verified } = req.body;
  const id = req.params.id;

  db.query("SELECT email, name, status, isVerified, city, dob, mobile FROM users WHERE id=?", [id], (err, userResult) => {
    if (err || userResult.length === 0) return res.status(500).send(err);
    const targetUser = userResult[0];

    db.query("UPDATE users SET isVerified=? WHERE id=?", [verified, id], (updateErr) => {
      if (updateErr) return res.status(500).send(updateErr);

      const actionText = (verified === 1 || verified === "1") ? "Activated" : "No";
      const changes = [`Verification status changed`];

      logActivity(
        "Admin", 
        "admin@mailinator.com", 
        targetUser.email, 
        actionText, 
        targetUser.status, 
        verified,
        targetUser.city,
        targetUser.dob,
        targetUser.mobile, 
        changes, 
        () => { res.send("Verified Updated"); }
      );
    });
  });
});

// ================= UNIVERSAL SEND OTP =================
app.post("/send-otp", async (req, res) => {
  const { email, type } = req.body; 
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
    if (err) return res.status(500).json({ success: false, error: "DB Error" });

    if (result.length > 0) {
      db.query("UPDATE users SET otp = ? WHERE email = ?", [otp, email], async (updateErr) => {
        if (updateErr) return res.status(500).json({ success: false, error: "Update Failed" });
        try {
          await sendOTP(email, otp);
          res.json({ success: true, message: "OTP Updated & Sent Successfully" });
        } catch (mailErr) {
          res.status(500).json({ success: false, error: "Email sending failed" });
        }
      });
    } else if (type === 'registration') {
      db.query(
        "INSERT INTO users (email, otp, isVerified, status, name) VALUES (?, ?, 0, 'active', 'New User')",
        [email, otp],
        async (insertErr) => {
          if (insertErr) return res.status(500).json({ success: false, error: "Insert Failed" });
          try {
            await sendOTP(email, otp);
            res.json({ success: true, message: "OTP Sent for Registration" });
          } catch (mailErr) {
            res.status(500).json({ success: false, error: "Email failed" });
          }
        }
      );
    } else {
      res.status(404).json({ success: false, message: "User not found in Dashboard" });
    }
  });
});

// ================= UNIVERSAL VERIFY OTP =================
app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;
  const sql = "SELECT * FROM users WHERE email = ? AND otp = ?";
  db.query(sql, [email, otp], (err, result) => {
    if (err) return res.status(500).json({ error: "Server Error" });

    if (result.length > 0) {
      const user = result[0];
      const sqlUpdate = "UPDATE users SET isVerified = 1, otp = NULL WHERE email = ?";
      db.query(sqlUpdate, [email], (updateErr) => {
        if (updateErr) return res.status(500).json({ error: "Verify Error" });

        res.status(200).json({
          success: true,
          message: "Verified! Redirecting... ✅",
          user: { id: user.id, name: user.name, email: user.email, status: user.status, profile_pic: user.profile_pic }
        });
      });
    } else {
      res.status(400).json({ success: false, message: "Invalid OTP ❌" });
    }
  });
});

// ================= REGISTER =================
app.post("/register-final", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = "UPDATE users SET name = ?, password = ? WHERE email = ?";
    db.query(sql, [name.trim(), hashedPassword, email.trim()], (err, result) => {
      if (err) return res.status(500).send({ success: false, message: "Database Error" });
      res.send({ success: true, message: "User Registered Successfully ✅" });
    });
  } catch (error) {
    res.status(500).send({ success: false, message: "Server Error" });
  }
});

// ================= LOGIN =================
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql, [email], async (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });

    if (result.length > 0) {
      const user = result[0];

      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.json({ success: false, message: "Invalid Password ❌" });

      if (user.status === "inactive") {
        return res.json({ success: false, message: "🚫 Account blocked!" });
      }

      if (user.isVerified === 0) {
        return res.json({ 
          success: false, 
          message: "⚠️ Account not verified!", 
          isVerified: 0,
          user: { email: user.email } 
        });
      }

      res.json({
        success: true,
        message: "Login Successful ✅",
        user: { id: user.id, name: user.name, email: user.email, profile_pic: user.profile_pic }
      });
    } else {
      res.json({ success: false, message: "Email not found ❌" });
    }
  });
});

// ==================== GET ALL ACTIVITY LOGS ==================== //
app.get("/activity-log", (req, res) => {
  db.query("SELECT * FROM activity_logs ORDER BY id DESC", (err, result) => {
    if (err) {
      console.error("Database query error:", err);
      return res.status(500).send(err);
    }
    
    const logs = result.map(log => {
      let parsedChanges = [];
      
      if (log.changes) {
        try {
          const parsed = JSON.parse(log.changes);
          if (Array.isArray(parsed)) {
            parsedChanges = parsed;
          } else {
            parsedChanges = [String(parsed)];
          }
        } catch (e) {
          parsedChanges = [log.changes];
        }
      }

      let dynamicTime = log.time;
      if (!dynamicTime || dynamicTime === "Just now") {
        dynamicTime = new Date().toLocaleString("en-GB", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        }).replace(",", " at");
      }

      return {
        id: log.id,
        name: log.performer_name || "System",
        email: log.performer_email || "no-email",
        targetUserEmail: log.target_user_email || "user",
        action: log.action || "",
        status: log.status || "active",
        verified: (log.verified === "Yes" || log.verified === 1) ? 1 : 0,
        time: dynamicTime,
        changes: parsedChanges,
        city: log.city || "-",
        dob: log.dob ? cleanDateFormat(log.dob) : "-",
        mobile: log.mobile || "-"
      };
    });

    res.json(logs);
  });
});

// ============ USER STATUS ================
app.get("/user-status/:id", (req, res) => {
  db.query("SELECT status, isVerified FROM users WHERE id = ?", [req.params.id], (err, result) => {
    if (err) return res.status(500).send(err);
    res.json({ status: result[0].status, isVerified: result[0].isVerified });
  });
});

// ================= ADD USER ROUTE =================
app.post("/add-user", upload.array("upload_files"), async (req, res) => {
  if (!req.body) {
    return res.status(400).json({ success: false, message: "Form data not received properly" });
  }

  const { title, name, email, mobile, dob, gender, state, city, skills, country, address, password, status } = req.body;
  
  if (!name || !email) {
    return res.status(400).json({ success: false, message: "Required fields are missing" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password || "Default@123", 10);
    const skillsData = typeof skills === 'string' ? skills : JSON.stringify(skills || []);

    const sql = `INSERT INTO users (title, name, email, mobile, dob, gender, state, city, skills, country, address, password, status) VALUES (?, ?, ?, ?, ?,?, ?, ?, ?, ?, ?, ?, ?)`;
    db.query(sql, [title || "", name, email, mobile || "", dob || null, gender || "", state || "", city || "", skillsData, country || "", address || "", hashedPassword, status || 'active'], (err) => {
      if (err) return res.status(500).json({ success: false, error: err.sqlMessage });
      res.json({ success: true, message: "User added successfully" });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// ==================== EDIT USER ROUTE (FIXED) ==================== //

app.put("/update-user/:id", upload.fields([{ name: 'profile_pic', maxCount: 1 }, { name: 'upload_files' }]), async (req, res) => {
  const id = req.params.id;
  if (!req.body) {
    return res.status(400).json({ success: false, message: "Form data not received" });
  }

  const { name, email, title, dob, mobile, gender, state, city, skills, country, language, address, password } = req.body;
  
  let profile_pic = (req.files && req.files['profile_pic']) ? req.files['profile_pic'][0].filename : null;

  db.query("SELECT * FROM users WHERE id = ?", [id], async (err, oldResult) => {
    if (err || oldResult.length === 0) return res.json({ success: false, message: "User not found" });
    const oldData = oldResult[0];

    const finalPic = profile_pic || oldData.profile_pic;
    const safeSkills = typeof skills === 'string' ? skills : JSON.stringify(skills || []);
    const finalLanguage = (language === "undefined" || language === undefined) ? oldData.language : language;

    let sql = "UPDATE users SET name=?, email=?, title=?, dob=?, mobile=?, gender=?, state=?, city=?, skills=?, country=?, language=?, address=?, profile_pic=? WHERE id=?";
    let params = [name || oldData.name, email || oldData.email, title || oldData.title, dob || oldData.dob, mobile || oldData.mobile, gender || oldData.gender, state || oldData.state, city || oldData.city, safeSkills, country || oldData.country, finalLanguage, address || oldData.address, finalPic, id];

    if (password && password.trim() !== "" && password !== "undefined") {
        const hashedPassword = await bcrypt.hash(password, 10);
        sql = "UPDATE users SET name=?, email=?, title=?, dob=?, mobile=?, gender=?, state=?, city=?, skills=?, country=?, language=?, address=?, profile_pic=?, password=? WHERE id=?";
        params = [name || oldData.name, email || oldData.email, title || oldData.title, dob || oldData.dob, mobile || oldData.mobile, gender || oldData.gender, state || oldData.state, city || oldData.city, safeSkills, country || oldData.country, finalLanguage, address || oldData.address, finalPic, hashedPassword, id];
    }

    db.query(sql, params, (updateErr) => {
        if (updateErr) {
          console.error("SQL Error Details:", updateErr); 
          return res.status(500).json({ success: false, message: updateErr.sqlMessage || "Database Error" });
        }
        res.json({ success: true, profile_pic: finalPic });
    });
  });
});
app.get('/api/get-all-users', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, name FROM users ORDER BY id DESC');
        res.json({ success: true, users: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database error while fetching users" });
    }
});

// 1. GET Permissions API
app.get('/api/get-permissions/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        // 💡 query se pehle .promise() joda hai
        const [rows] = await db.promise().query('SELECT page_name FROM user_permissions WHERE user_id = ?', [userId]);
        
        const pages = rows && rows.length > 0 ? rows.map(row => row.page_name) : [];
        return res.json({ success: true, pages });
    } catch (error) {
        console.error("GET Permissions Error:", error);
        return res.status(500).json({ success: false, message: "Database query error" });
    }
});

// 2. POST Save Permissions API
app.post('/api/save-permissions', async (req, res) => {
    const { userId, allowedPages } = req.body;

    if (!userId) {
        return res.status(400).json({ success: false, message: "User ID missing hai." });
    }

    try {
        await db.promise().query('DELETE FROM user_permissions WHERE user_id = ?', [userId]);

        if (allowedPages && allowedPages.length > 0) {
            const values = allowedPages.map(page => [userId, page]);
            
            await db.promise().query('INSERT INTO user_permissions (user_id, page_name) VALUES ?', [values]);
        }

        //return res.json({ success: true, message: "Permissions Updated Successfully! ✅" });
    } catch (error) {
        console.error("POST Save Permissions Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error while saving data" });
    }
});
app.get('/api/dashboard/masters-count', (req, res) => {
    const query = `
        SELECT 
            (SELECT COUNT(*) FROM countries) AS Total_Countries,
            (SELECT COUNT(*) FROM states) AS Total_States,
            (SELECT COUNT(*) FROM cities) AS Total_Cities,
            (SELECT COUNT(*) FROM languages) AS Total_Languages,
            (SELECT COUNT(*) FROM skills) AS Total_Skills
    `;

    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const data = results[0];
        const graphData = [
            { name: 'Countries', count: data.Total_Countries },
            { name: 'States', count: data.Total_States },
            { name: 'Cities', count: data.Total_Cities },
            { name: 'Languages', count: data.Total_Languages },
            { name: 'Skills', count: data.Total_Skills }
        ];
        res.json(graphData);
    });
});

// Fetch all dashboard users for the table
app.get('/api/users', (req, res) => {
    db.query('SELECT * FROM users ORDER BY id DESC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Bar Graph Ke Liye Data API (Group by Month)
app.get('/api/dashboard/graph-data', (req, res) => {
    const query = `
        SELECT MONTHNAME(created_at) as month, COUNT(id) as user_count 
        FROM users 
        GROUP BY MONTH(created_at)
        ORDER BY MONTH(created_at)
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// ==================== COUNTRY MASTER APIs ==================== //
// 1. ADD COUNTRY
app.post('/api/add-state', (req, res) => {
    const { country_id, state_name } = req.body; 

    db.query(
        'SELECT id FROM states WHERE country_id = ? AND LOWER(TRIM(state_name)) = LOWER(?)', 
        [country_id, state_name.trim()],
        (err, existingState) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Server Error' });
            }

            if (existingState.length > 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: '⚠️ Is Country me ye State pehle se add hai! Aap dobara add nahi kar sakte.' 
                });
            }

            db.query('INSERT INTO states (country_id, state_name) VALUES (?, ?)', [country_id, state_name.trim()], (insertErr, insertResult) => {
                if (insertErr) {
                    return res.status(500).json({ success: false, message: 'Server Error' });
                }
                return res.json({ success: true, message: 'State successfully add ho gaya!' });
            });
        }
    );
});

// MASTER ACTIVITY LOG ENDPOINT
app.get("/master-activity-log", (req, res) => {
  const query = "SELECT id, admin_name, admin_email, module, action_type, changes, DATE_FORMAT(created_at, '%d-%m-%Y %h:%i %p') AS time FROM master_activity_log ORDER BY created_at DESC";

  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching master logs:", err);
      return res.status(500).json({ error: "Database error occurred" });
    }
    res.json(results);
  });
});

// 2. GET ALL COUNTRIES
app.get('/api/countries', (req, res) => {
    const sql = 'SELECT id, country_name FROM countries';
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error("❌ Error fetching countries:", err.message);
            return res.status(500).json({ error: "Database error", details: err.message });
        }
        res.json(results);
    });
});

// 3. EDIT COUNTRY (Strict Actual Admin Verification & Changes Log)
app.put('/api/countries/:id', (req, res) => {
    const { country_name, admin_name, admin_email } = req.body; // Frontend se actual login user ka name aur email aana compulsory hai
    const { id } = req.params;
    
    if (!admin_name || !admin_email) {
        return res.status(400).json({ error: "⚠️ Missing Admin Info! Kis user ne change kiya hai wo data zaroori hai." });
    }
    
    db.query('SELECT country_name FROM countries WHERE id = ?', [id], (fetchErr, fetchResult) => {
        if (fetchErr || fetchResult.length === 0) {
            return res.status(500).json({ error: "Country not found" });
        }
        
        const oldName = fetchResult[0].country_name;
        
        if (oldName === country_name) {
            return res.json({ message: "No changes made to country name" });
        }

        const changesDescription = `Changed Country Name from "${oldName}" to "${country_name}"`;

        db.query('UPDATE countries SET country_name = ? WHERE id = ?', [country_name, id], (err, result) => {
            if (err) {
                console.error("❌ Error updating country:", err);
                return res.status(500).json({ error: "Database error" });
            }
            
            const logSql = 'INSERT INTO master_activity_log (admin_name, admin_email, module, action_type, changes) VALUES (?, ?, ?, ?, ?)';
            db.query(logSql, [admin_name, admin_email, 'Country Master', 'UPDATE', changesDescription], (logErr) => {
                if (logErr) console.error("❌ Log Entry Failed:", logErr);
                
                res.json({ message: "Country updated successfully" });
            });
        });
    });
});

// 4. DELETE COUNTRY (Strict Actual Admin Verification)
app.delete('/api/countries/:id', (req, res) => {
    const { id } = req.params;
    const { admin_name, admin_email } = req.body; // Frontend se DELETE request ki body me bhi info bhejna hoga
    
    if (!admin_name || !admin_email) {
        return res.status(400).json({ error: "⚠️ Missing Admin Info! Kis user ne delete kiya hai wo data zaroori hai." });
    }
    
    db.query('SELECT country_name FROM countries WHERE id = ?', [id], (fetchErr, fetchResult) => {
        if (fetchErr || fetchResult.length === 0) {
            return res.status(500).json({ error: "Country not found" });
        }
        
        const deletedCountryName = fetchResult[0].country_name;
        const changesDescription = `Deleted Country "${deletedCountryName}"`;

        db.query('DELETE FROM countries WHERE id = ?', [id], (err, result) => {
            if (err) {
                console.error("❌ Error deleting country:", err);
                return res.status(500).json({ error: "Database error" });
            }
            
            const logSql = 'INSERT INTO master_activity_log (admin_name, admin_email, module, action_type, changes) VALUES (?, ?, ?, ?, ?)';
            db.query(logSql, [admin_name, admin_email, 'Country Master', 'DELETE', changesDescription], (logErr) => {
                if (logErr) console.error("❌ Log Entry Failed:", logErr);
                
                res.json({ message: "Country deleted successfully" });
            });
        });
    });
});

// 5. ADD NEW COUNTRY (Strict Actual Admin Verification)
app.post('/api/countries', (req, res) => {
    const { country_name, admin_name, admin_email } = req.body; 
    
    if (!admin_name || !admin_email) {
        return res.status(400).json({ error: "⚠️ Missing Admin Info! Kis user ne add kiya hai wo data zaroori hai." });
    }
    
    db.query('INSERT INTO countries (country_name) VALUES (?)', [country_name], (err, result) => {
        if (err) {
            // Check karein agar MySQL ne Duplicate Entry (Error Code 1062) phenka hai
            if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
               // console.log(`⚠️ Duplicate entry blocked for: "${country_name}"`);
                
                return res.status(409).json({ message: "This country already exists!" });
            }

            console.error("❌ Error adding country:", err);
            return res.status(500).json({ error: "Database error" });
        }
        
        const changesDescription = `Added New Country: "${country_name}"`;
        const logSql = 'INSERT INTO master_activity_log (admin_name, admin_email, module, action_type, changes) VALUES (?, ?, ?, ?, ?)';
        
        db.query(logSql, [admin_name, admin_email, 'Country Master', 'INSERT', changesDescription], (logErr) => {
            if (logErr) console.error("❌ Log Entry Failed:", logErr);
            
            res.json({ message: "Country added successfully", id: result.insertId });
        });
    });
});
// STATE MASTER ROUTES (Iske baad shuru honge...)
// ==========================================

// 1. GET ALL STATES (Table me data display karne ke liye)
app.get('/api/states', (req, res) => {
    const sql = `
        SELECT 
            s.id, 
            s.name AS state_name, 
            co.id AS country_id, 
            co.country_name 
        FROM states s
        LEFT JOIN countries co ON s.country_id = co.id
        ORDER BY s.id DESC
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error("❌ Error fetching states list:", err.message);
            return res.status(500).json({ error: "Database error", details: err.message });
        }
        res.json(results);
    });
});

// 2. POST - ADD NEW STATE (Fixed Version)
app.post('/api/add-states', (req, res) => { // <-- async hata diya
    const { country_id, state_name } = req.body; 

    // Validation
    if (!country_id || !state_name) {
        return res.status(400).json({ success: false, message: 'Country aur State dono zaroori hain!' });
    }

    const checkSql = 'SELECT id FROM states WHERE country_id = ? AND LOWER(TRIM(name)) = LOWER(?)';
    
    db.query(checkSql, [country_id, state_name.trim()], (err, existingState) => {
        if (err) {
            console.error("❌ Database Error during check:", err);
            return res.status(500).json({ success: false, message: 'Server me kuch dikkat hai.' });
        }

        if (existingState.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'This state already exists!' 
            });
        }

        const insertSql = 'INSERT INTO states (country_id, name) VALUES (?, ?)';
        db.query(insertSql, [country_id, state_name.trim()], (insertErr, result) => {
            if (insertErr) {
                if (insertErr.code === 'ER_DUP_ENTRY' || insertErr.errno === 1062) {
                    return res.status(400).json({ 
                        success: false, 
                        message: 'This state already exists!' 
                    });
                }
                console.error("❌ Database Error during insert:", insertErr);
                return res.status(500).json({ success: false, message: 'Server me kuch dikkat hai.' });
            }

            return res.json({ success: true, message: 'State successfully add ho gaya!' });
        });
    });
});
app.post("/add-state", (req, res) => {


    const { country_id, state_name, adminName } = req.body;

   

    console.log("--> API Hit Hui! Data aaya:", { country_id, state_name, adminName });



    const insertSql = "INSERT INTO states (country_id, state_name) VALUES (?, ?)";




    db.query(insertSql, [country_id, state_name], (err, result) => {

        if (err) {

            console.error("❌ State table error:", err);

            return res.status(500).json({ success: false, message: "Database error" });

        }



        console.log("✅ State insert ho gaya! Ab log save karenge...");




        const logSql = "INSERT INTO activity_logs (module_name, action_type, performed_by, description) VALUES (?, ?, ?, ?)";

        const logDescription = `Added new state: "${state_name}"`;

        const currentAdmin = adminName || 'Admin';



        db.query(logSql, ['State', 'ADD', currentAdmin, logDescription], (logErr, logResult) => {

            if (logErr) {

                console.error("❌ Activity Log ki SQL fail hui:", logErr.message);


                return res.json({ success: true, message: 'Saved but log failed!' });

            }



            console.log("🎉 Activity Log table me data save ho gaya! Row ID:", logResult.insertId);

           

            // 4. Dono kaam hone ke baad response

            return res.json({ success: true, message: 'Saved successfully with log!' });

        });

    });

}); 
// Is code ko backend file (server.js) me routes ke sath niche paste kar dein
app.get('/api/master-activity-log', (req, res) => {
    const { moduleName } = req.query; // Frontend se aane wala ?moduleName=...
    
    let sql = 'SELECT * FROM master_activity_log';
    let queryParams = [];

    if (moduleName) {
        sql += ' WHERE module = ?';
        queryParams.push(moduleName);
    }
    
    sql += ' ORDER BY id DESC';

    db.query(sql, queryParams, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});
// 3. PUT - EDIT/UPDATE STATE (Fixed: Column changed from state_name to name)
app.put('/api/states/:id', (req, res) => {
    const { id } = req.params;
    const { country_id, state_name, admin_name, admin_email } = req.body;

    if (!admin_name || !admin_email) {
        return res.status(400).json({ error: "⚠️ Missing Admin Info!" });
    }

    // Fetch using 'name' column
    const fetchSql = 'SELECT name, country_id FROM states WHERE id = ?';
    db.query(fetchSql, [id], (fetchErr, fetchResult) => {
        if (fetchErr || fetchResult.length === 0) {
            return res.status(500).json({ error: "State not found" });
        }

        const oldStateName = fetchResult[0].name;
        const oldCountryId = fetchResult[0].country_id;

        if (oldStateName === state_name.trim() && Number(oldCountryId) === Number(country_id)) {
            return res.json({ message: "No changes made to state data" });
        }

        let changesDescription = `Updated State ID ${id}:`;
        if (oldStateName !== state_name.trim()) {
            changesDescription += ` Name changed from "${oldStateName}" to "${state_name.trim()}".`;
        }
        if (Number(oldCountryId) !== Number(country_id)) {
            changesDescription += ` Country ID shifted from ${oldCountryId} to ${country_id}.`;
        }

        // Update using 'name' column
        const updateSql = 'UPDATE states SET name = ?, country_id = ? WHERE id = ?';
        db.query(updateSql, [state_name.trim(), country_id, id], (err, result) => {
            if (err) {
                console.error("❌ Error updating state:", err);
                return res.status(500).json({ error: "Database error" });
            }

            const logSql = 'INSERT INTO master_activity_log (admin_name, admin_email, module, action_type, changes) VALUES (?, ?, ?, ?, ?)';
            db.query(logSql, [admin_name, admin_email, 'State Master', 'UPDATE', changesDescription], (logErr) => {
                if (logErr) console.error("❌ Log Entry Failed:", logErr);
                return res.json({ message: "State updated successfully" });
            });
        });
    });
});

// 4. DELETE - DELETE STATE (Fixed: Column changed from state_name to name)
app.delete('/api/states/:id', (req, res) => {
    const { id } = req.params;
    const { admin_name, admin_email } = req.body;

    if (!admin_name || !admin_email) {
        return res.status(400).json({ error: "⚠️ Missing Admin Info!" });
    }

    // Fetch using 'name' column before delete
    db.query('SELECT name FROM states WHERE id = ?', [id], (fetchErr, fetchResult) => {
        if (fetchErr || fetchResult.length === 0) {
            return res.status(500).json({ error: "State not found" });
        }

        const deletedStateName = fetchResult[0].name;
        const changesDescription = `Deleted State "${deletedStateName}" (ID: ${id})`;

        db.query('DELETE FROM states WHERE id = ?', [id], (err, result) => {
            if (err) {
                console.error("❌ Error deleting state:", err);
                return res.status(500).json({ error: "Database error" });
            }

            const logSql = 'INSERT INTO master_activity_log (admin_name, admin_email, module, action_type, changes) VALUES (?, ?, ?, ?, ?)';
            db.query(logSql, [admin_name, admin_email, 'State Master', 'DELETE', changesDescription], (logErr) => {
                if (logErr) console.error("❌ Log Entry Failed:", logErr);
                return res.json({ message: "State deleted successfully" });
            });
        });
    });
});
// C. DEPENDENT ROUTE (City Master Page me dropdown load karne ke liye)
app.get('/api/countries/:countryId/states', (req, res) => {
    const { countryId } = req.params;
    const sql = 'SELECT id, name AS state_name FROM states WHERE country_id = ?';
    db.query(sql, [countryId], (err, results) => {
        if (err) {
            console.error("❌ Error fetching dependent states:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});
// ==========================================
// 3. GET ALL CITIES (Table me data display karne ke liye)
app.get('/api/cities', (req, res) => {
    const sql = `
        SELECT 
            c.id, 
            c.name AS city_name, 
            s.id AS state_id, 
            s.name AS state_name, 
            co.id AS country_id, 
            co.country_name
        FROM cities c
        LEFT JOIN states s ON c.state_id = s.id
        LEFT JOIN countries co ON s.country_id = co.id
        ORDER BY c.id DESC
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error("❌ Error fetching cities:", err.message);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});

// ==========================================
// 4. ADD NEW CITY (POST) WITH LOGS
app.post('/api/add-city', (req, res) => {
    const { state_id, city_name, admin_name, admin_email } = req.body; 

    if (!state_id || !city_name) {
        return res.status(400).json({ success: false, message: 'State aur City dono zaroori hain!' });
    }

    const checkSql = 'SELECT id FROM cities WHERE state_id = ? AND LOWER(TRIM(name)) = LOWER(?)';
    
    db.query(checkSql, [state_id, city_name.trim()], (err, existingCity) => {
        if (err) {
            console.error("❌ Database Error during check:", err);
            return res.status(500).json({ success: false, message: 'Server me kuch dikkat hai.' });
        }

        if (existingCity.length > 0) {
            return res.status(400).json({ success: false, message: 'This city already exists!' });
        }

        const insertSql = 'INSERT INTO cities (state_id, name) VALUES (?, ?)';
        db.query(insertSql, [state_id, city_name.trim()], (insertErr, result) => {
            if (insertErr) {
                console.error("❌ Database Error during insert:", insertErr);
                return res.status(500).json({ success: false, message: 'Server me kuch dikkat hai.' });
            }

            // === ACTIVITY LOG ENTRY ===
            const logSql = 'INSERT INTO master_activity_log (module, action_type, changes, admin_name, admin_email) VALUES (?, ?, ?, ?, ?)';
            const logDesc = `Added new city: "${city_name.trim()}"`;
            db.query(logSql, ['City Master', 'ADD', logDesc, admin_name || 'Rani', admin_email || 'rani@gmail.com'], (logErr) => {
                if (logErr) console.error("❌ Error saving add log:", logErr.message);
            });

            return res.json({ success: true, message: 'City successfully add ho gaya!' });
        });
    });
});

// ==========================================
// 5. EDIT / UPDATE CITY (PUT) WITH LOGS
app.put('/api/cities/:id', (req, res) => {
    const { id } = req.params;
    const { state_id, city_name, admin_name, admin_email } = req.body;

    if (!state_id || !city_name || city_name.trim() === "") {
        return res.status(400).json({ message: "All fields are required" });
    }

    const sql = 'UPDATE cities SET name = ?, state_id = ? WHERE id = ?';
    db.query(sql, [city_name.trim(), state_id, id], (err, result) => {
        if (err) {
            console.error("❌ Error updating city:", err);
            return res.status(500).json({ error: "Database error", details: err.sqlMessage });
        }

        // === ACTIVITY LOG ENTRY ===
        const logSql = 'INSERT INTO master_activity_log (module, action_type, changes, admin_name, admin_email) VALUES (?, ?, ?, ?, ?)';
        const logDesc = `Updated City ID ${id} to "${city_name.trim()}"`;
        db.query(logSql, ['City Master', 'UPDATE', logDesc, admin_name || 'Rani', admin_email || 'rani@gmail.com'], (logErr) => {
            if (logErr) console.error("❌ Error saving update log:", logErr.message);
        });

        res.json({ message: "City updated successfully" });
    });
});

// ==========================================
// 6. DELETE CITY (DELETE) WITH LOGS
app.delete('/api/cities/:id', (req, res) => {
    const { id } = req.params;
    const { admin_name, admin_email } = req.body; 

    const sql = 'DELETE FROM cities WHERE id = ?';
    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error("❌ Error deleting city:", err);
            return res.status(500).json({ error: "Database error" });
        }

        // === ACTIVITY LOG ENTRY ===
        const logSql = 'INSERT INTO master_activity_log (module, action, description, admin_name, admin_email) VALUES (?, ?, ?, ?, ?)';
        const logDesc = `Deleted City ID: ${id}`;
        db.query(logSql, ['City Master', 'DELETE', logDesc, admin_name || 'Rani', admin_email || 'rani@gmail.com'], (logErr) => {
            if (logErr) console.error("❌ Error saving delete log:", logErr.message);
        });

        res.json({ message: "City deleted successfully" });
    });
});

// ==========================================
// 7. GET MASTER ACTIVITY LOG (Upar ka filter query handler)
app.get('/api/master-activity-log', (req, res) => {
    // Frontend se 'module' ya 'moduleName' dono me se kuch bhi aaye, ye handle kar lega
    const moduleName = req.query.moduleName || req.query.module; 
    
    let sql = 'SELECT * FROM master_activity_log';
    let queryParams = [];

    if (moduleName) {
        sql += ' WHERE module = ?';
        queryParams.push(moduleName);
    }
    
    sql += ' ORDER BY id DESC'; 

    db.query(sql, queryParams, (err, results) => {
        if (err) {
            console.error("❌ Error fetching activity logs:", err.message);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});
// 1. LANGUAGE MASTER ROUTES
// ==========================================
app.get('/api/languages', (req, res) => {
    const sql = 'SELECT id, language_name FROM languages ORDER BY id DESC';
    db.query(sql, (err, results) => {
        if (err) {
            console.error("❌ Error fetching languages:", err.message);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});

// ==========================================
// 2. ADD NEW LANGUAGE (With Logs & Duplicate Check)
app.post('/api/languages', (req, res) => {
    const { language_name, admin_name, admin_email } = req.body;
    if (!language_name || language_name.trim() === "") {
        return res.status(400).json({ message: "Language name is required" });
    }
    const cleanLang = language_name.trim();

    // === DUPLICATE CHECK ===
    const checkSql = 'SELECT id FROM languages WHERE LOWER(TRIM(language_name)) = LOWER(?)';
    db.query(checkSql, [cleanLang], (err, existing) => {
        if (err) return res.status(500).json({ error: "Verification failed" });
        if (existing.length > 0) {
            return res.status(400).json({ message: "This language already exists!" }); // Yeh repeat hone se rokega
        }

        // Agar duplicate nahi hai toh insert karo
        db.query('INSERT INTO languages (language_name) VALUES (?)', [cleanLang], (insertErr, result) => {
            if (insertErr) return res.status(500).json({ error: insertErr.message });

            // Log entry code
            const logSql = 'INSERT INTO master_activity_log (module, action_type, changes, admin_name, admin_email) VALUES (?, ?, ?, ?, ?)';
            db.query(logSql, ['Language Master', 'ADD', `Added language: "${cleanLang}"`, admin_name || 'Rani', admin_email || 'rani@gmail.com'], () => {});

            res.json({ success: true, message: "Language added successfully", id: result.insertId });
        });
    });
});

// ==========================================
// 3. EDIT / UPDATE LANGUAGE (PUT Route)
app.put('/api/languages/:id', (req, res) => {
    const { id } = req.params;
    const { language_name, admin_name, admin_email } = req.body;

    if (!language_name || language_name.trim() === "") {
        return res.status(400).json({ message: "Language name is required for update" });
    }

    const cleanLanguage = language_name.trim();

    // Duplicate Check: Kisi doosri language ka naam isse match na ho jaye
    const checkSql = 'SELECT id FROM languages WHERE LOWER(TRIM(language_name)) = LOWER(?) AND id <> ?';
    db.query(checkSql, [cleanLanguage, id], (err, existingLang) => {
        if (err) {
            console.error("❌ Database Error during check:", err);
            return res.status(500).json({ error: "Database verification failed" });
        }

        if (existingLang.length > 0) {
            return res.status(400).json({ message: "Another language with this name already exists!" });
        }

        // Update Query
        const updateSql = 'UPDATE languages SET language_name = ? WHERE id = ?';
        db.query(updateSql, [cleanLanguage, id], (updateErr, result) => {
            if (updateErr) {
                console.error("❌ Error updating language:", updateErr);
                return res.status(500).json({ error: updateErr.message });
            }

            // === ACTIVITY LOG ENTRY ===
            const logSql = 'INSERT INTO master_activity_log (module, action_type, changes, admin_name, admin_email) VALUES (?, ?, ?, ?, ?)';
            const logDesc = `Updated Language ID ${id} to "${cleanLanguage}"`;
            
            db.query(logSql, ['Language Master', 'UPDATE', logDesc, admin_name || 'Rani', admin_email || 'rani@gmail.com'], (logErr) => {
                if (logErr) console.error("❌ Error saving language update log:", logErr.message);
            });

            res.json({ success: true, message: "Language updated successfully" });
        });
    });
});

// ==========================================
// 4. DELETE LANGUAGE (With Log handling - Actual Name Included!)
app.delete('/api/languages/:id', (req, res) => {
    const { id } = req.params;
    const { admin_name, admin_email } = req.body; 

    // Step 1: Delete karne se pehle name fetch karo taaki log me naam dikhe
    const getNameSql = 'SELECT language_name FROM languages WHERE id = ?';
    
    db.query(getNameSql, [id], (nameErr, nameResult) => {
        if (nameErr) {
            console.error("❌ Error fetching language name before delete:", nameErr);
            return res.status(500).json({ error: nameErr.message });
        }

        // Agar language nahi mili, toh safe return
        if (nameResult.length === 0) {
            return res.status(404).json({ message: "Language not found!" });
        }

        const deletedLanguageName = nameResult[0].language_name;

        // Step 2: Ab database se delete karo
        const deleteSql = 'DELETE FROM languages WHERE id = ?';
        db.query(deleteSql, [id], (err, result) => {
            if (err) {
                console.error("❌ Error deleting language:", err);
                return res.status(500).json({ error: err.message });
            }

            // === ACTIVITY LOG ENTRY ===
            // Ab changes me "Deleted Language: Hindi" jaise actual naam save hoga!
            const logSql = 'INSERT INTO master_activity_log (module, action_type, changes, admin_name, admin_email) VALUES (?, ?, ?, ?, ?)';
            const logDesc = `Deleted language: "${deletedLanguageName}" (ID: ${id})`;
            
            db.query(logSql, ['Language Master', 'DELETE', logDesc, admin_name || 'Rani', admin_email || 'rani@gmail.com'], (logErr) => {
                if (logErr) console.error("❌ Error saving language delete log:", logErr.message);
            });

            res.json({ success: true, message: "Language deleted successfully" });
        });
    });
});


// 2. SKILL MASTER ROUTES
// 1. GET ALL SKILLS
// ==========================================
app.get('/api/skills', (req, res) => {
    const sql = 'SELECT id, skill_name FROM skills ORDER BY id DESC';
    db.query(sql, (err, results) => {
        if (err) {
            console.error("❌ Error fetching skills:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// ==========================================
// 1. GET ALL SKILLS (Table me data display karne ke liye)
app.get('/api/skills', (req, res) => {
    const sql = 'SELECT id, skill_name FROM skills ORDER BY id DESC';
    db.query(sql, (err, results) => {
        if (err) {
            console.error("❌ Error fetching skills:", err.message);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});

// ==========================================
// 2. ADD NEW SKILL (With Logs & Duplicate Check)
app.post('/api/skills', (req, res) => {
    const { skill_name, admin_name, admin_email } = req.body;
    if (!skill_name || skill_name.trim() === "") {
        return res.status(400).json({ message: "Skill name is required" });
    }
    const cleanSkill = skill_name.trim();

    // === DUPLICATE CHECK ===
    const checkSql = 'SELECT id FROM skills WHERE LOWER(TRIM(skill_name)) = LOWER(?)';
    db.query(checkSql, [cleanSkill], (err, existing) => {
        if (err) return res.status(500).json({ error: "Verification failed" });
        if (existing.length > 0) {
            return res.status(400).json({ message: "This skill already exists!" }); // Yeh repeat hone se rokega
        }

        // Agar duplicate nahi hai toh insert karo
        db.query('INSERT INTO skills (skill_name) VALUES (?)', [cleanSkill], (insertErr, result) => {
            if (insertErr) return res.status(500).json({ error: insertErr.message });
            
            // Log entry code
            const logSql = 'INSERT INTO master_activity_log (module, action_type, changes, admin_name, admin_email) VALUES (?, ?, ?, ?, ?)';
            db.query(logSql, ['Skill Master', 'ADD', `Added skill: "${cleanSkill}"`, admin_name || 'Rani', admin_email || 'rani@gmail.com'], () => {});
            
            res.json({ success: true, message: "Skill added successfully", id: result.insertId });
        });
    });
});
// ==========================================
// 3. EDIT / UPDATE SKILL (PUT Route)
app.put('/api/skills/:id', (req, res) => {
    const { id } = req.params;
    const { skill_name, admin_name, admin_email } = req.body;

    if (!skill_name || skill_name.trim() === "") {
        return res.status(400).json({ message: "Skill name is required for update" });
    }

    const cleanSkill = skill_name.trim();

    // Duplicate Check: Kisi doosri skill ka naam isse match na ho jaye
    const checkSql = 'SELECT id FROM skills WHERE LOWER(TRIM(skill_name)) = LOWER(?) AND id <> ?';
    db.query(checkSql, [cleanSkill, id], (err, existingSkill) => {
        if (err) {
            console.error("❌ Database Error during check:", err);
            return res.status(500).json({ error: "Database verification failed" });
        }

        if (existingSkill.length > 0) {
            return res.status(400).json({ message: "Another skill with this name already exists!" });
        }

        // Update Query
        const updateSql = 'UPDATE skills SET skill_name = ? WHERE id = ?';
        db.query(updateSql, [cleanSkill, id], (updateErr, result) => {
            if (updateErr) {
                console.error("❌ Error updating skill:", updateErr);
                return res.status(500).json({ error: updateErr.message });
            }

            // === ACTIVITY LOG ENTRY ===
            // Note: Fixed column count to match values (5 columns, 5 parameters)
            const logSql = 'INSERT INTO master_activity_log (module, action_type, changes, admin_name, admin_email) VALUES (?, ?, ?, ?, ?)';
            const logDesc = `Updated Skill ID ${id} to "${cleanSkill}"`;
            
            db.query(logSql, ['Skill Master', 'UPDATE', logDesc, admin_name || 'Rani', admin_email || 'rani@gmail.com'], (logErr) => {
                if (logErr) console.error("❌ Error saving skill update log:", logErr.message);
            });

            res.json({ success: true, message: "Skill updated successfully" });
        });
    });
});

// ==========================================
// 4. DELETE SKILL (With Log handling)
app.delete('/api/skills/:id', (req, res) => {
    const { id } = req.params;
    const { admin_name, admin_email } = req.body; 

    const sql = 'DELETE FROM skills WHERE id = ?';
    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error("❌ Error deleting skill:", err);
            return res.status(500).json({ error: err.message });
        }

        // === ACTIVITY LOG ENTRY ===
        // Note: Uniformed column names with ADD/UPDATE ('action_type' and 'changes')
        const logSql = 'INSERT INTO master_activity_log (module, action_type, changes, admin_name, admin_email) VALUES (?, ?, ?, ?, ?)';
        const logDesc = `Deleted Skill ID: ${id}`;
        
        db.query(logSql, ['Skill Master', 'DELETE', logDesc, admin_name || 'Rani', admin_email || 'rani@gmail.com'], (logErr) => {
            if (logErr) console.error("❌ Error saving skill delete log:", logErr.message);
        });

        res.json({ success: true, message: "Skill deleted successfully" });
    });
});

// ==========================================
// 5. GET MASTER ACTIVITY LOG (Filter handler)
app.get('/api/master-activity-log', (req, res) => {
    const moduleQuery = req.query.moduleName || req.query.module;

    let sql = 'SELECT * FROM master_activity_log';
    let params = [];

    if (moduleQuery) {
        sql += ' WHERE LOWER(module) LIKE LOWER(?)';
        params.push(`%${moduleQuery.trim()}%`);
    }

    sql += ' ORDER BY id DESC';

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error("❌ Error fetching activity logs:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});
// --- GENERIC DELETE ROUTE FOR ALL MASTERS ---
app.delete('/api/:table/delete/:id', (req, res) => {
    const { table, id } = req.params;
    const allowedTables = ['users', 'countries', 'states', 'cities', 'languages', 'skills'];
    if (!allowedTables.includes(table)) return res.status(400).json({ error: "Invalid Table" });

    db.query(`DELETE FROM ${table} WHERE id = ?`, [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `${table} record deleted successfully!` });
    });
});
// ---- GET ACTIVITY LOGS API ----
app.get('/api/activity-logs/:tableName', (req, res) => {
    const { tableName } = req.params;
    const query = `
        SELECT admin_name, action_type, record_name,
               DATE_FORMAT(created_at, '%Y-%m-%d') as log_date, 
               DATE_FORMAT(created_at, '%h:%i %p') as log_time 
        FROM activity_logs 
        WHERE table_name = ? 
        ORDER BY id DESC
    `;
    
    db.query(query, [tableName], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, logs: rows });
    });
});
// SINGLE SERVER PORT CONFIGURATION
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`🚀 Backend Server running smoothly on port ${PORT}`);
});
