<div align="center">
  
  # ⚙️ EduManage Pro: Backend Core API
  
  <p align="center">
    The high-performance, secure backend architecture powering the EduManage Pro SaaS ERP.
  </p>

  <!-- Badges -->
  ![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
  ![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge)
  ![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
  ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
  ![Security](https://img.shields.io/badge/Security-JWT%20%7C%20BOLA%20Safe-blueViolet?style=for-the-badge)
  ![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)

</div>

## 📖 Professional Description
The **EduManage Pro Backend API** is the robust, strictly-typed foundation of the school management ERP. Built on Node.js and Express, it relies heavily on Prisma ORM to interact with a PostgreSQL database, ensuring exceptional relational data integrity. It is engineered with enterprise security at its core, featuring comprehensive JSON Web Token (JWT) authentication, strict Role-Based Access Control (RBAC), API rate limiting, and explicit mitigations against Broken Object-Level Authorization (BOLA) vulnerabilities to ensure multi-tenant isolation.

---

## 📑 Table of Contents
- [✨ Core Features](#-core-features)
- [🛠️ Tech Stack](#-tech-stack)
- [🏗️ Database Schema](#-database-schema)
- [📂 Folder Structure](#-folder-structure)
- [🚀 Quick Start & Installation](#-quick-start--installation)
- [🔑 Environment Variables](#-environment-variables)
- [🌐 Core API Endpoints](#-core-api-endpoints)
- [🛡️ Security Architecture](#-security-architecture)
- [📦 Deployment Instructions](#-deployment-instructions)
- [🔮 Future Enhancements](#-future-enhancements)
- [🚧 Challenges Faced](#-challenges-faced)
- [🎓 Learning Outcomes](#-learning-outcomes)
- [🤝 Contributing Guidelines](#-contributing-guidelines)
- [📄 License](#-license)
- [📫 Contact Information](#-contact-information)

---

## ✨ Core Features

| Feature | Description |
|:---|:---|
| 🔐 **RBAC Auth Gateway** | Strictly enforces endpoint access based on SuperAdmin, Principal, Teacher, or Student roles. |
| 🏫 **Multi-Tenant Architecture**| Uses tenant-ID (School ID) context injected via auth tokens to query data securely. |
| 🗄️ **Complex Relational Logic** | Handles intricate connections between Classes, Subjects, Syllabi, Marks, and Attendance. |
| 📁 **Cloud Asset Uploads** | Uses Multer and Cloudinary for profile images and assignment document storage. |
| ⏱️ **Automated Cron Jobs** | Node-cron manages automated triggers for pending correction requests or unassigned syllabi. |
| 🛡️ **Rate Limiting & Helmet** | Protects routes from brute-force login attempts and ensures secure HTTP headers. |

---

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database ORM:** Prisma
- **Database Engine:** PostgreSQL
- **Authentication:** JSON Web Tokens (JWT), Bcrypt / BcryptJS
- **Validation:** Joi (Input validation schemas)
- **File Uploads:** Multer, Multer-Storage-Cloudinary, Cloudinary SDK
- **Security:** Helmet, Express Rate Limit, CORS
- **Utilities:** Nodemailer (Emails), Node-Cron (Background tasks), XLSX (Excel parsing for bulk uploads)

---

## 🏗️ Database Schema

The database utilizes highly normalized relational data. A simplified overview of the Prisma relationships:
- `School` (1) ⟷ (∞) `Users` (Principals, Teachers, Students)
- `Teacher` (1) ⟷ (∞) `Classes` & `Subjects`
- `Student` (1) ⟷ (∞) `Marks` & `Attendance`
- `Syllabus` (1) ⟷ (∞) `Tasks` & `CorrectionRequests`

---

## 📂 Folder Structure

```text
Backend Service/
├── prisma/
│   ├── schema.prisma    # Primary database schema & model definitions
│   └── migrations/      # Auto-generated SQL migration history
├── src/
│   ├── controllers/     # Core business logic separated by domain
│   ├── middlewares/     # JWT extraction, Role verification, Error handlers
│   ├── routes/          # Express Router endpoint definitions
│   ├── utils/           # Global helpers (Cloudinary setup, Email transports)
│   └── index.js         # Express app entry point
├── .env                 # Environment secrets configuration
└── package.json
```

---

## 🚀 Quick Start & Installation

**Prerequisites:** Node.js (v18+), PostgreSQL

1. **Clone the Repository**
   ```bash
   git clone [ENTER GITHUB LINK]
   cd "EduManagePro/Backend Service"
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Database Initialization**
   ```bash
   npx prisma generate
   npx prisma db push
   # Or use 'npx prisma migrate dev' if tracking migrations
   ```

4. **Start the Development Server**
   ```bash
   npm run dev
   ```

---

## 🔑 Environment Variables

Create a `.env` file in the root of the **Backend Service** directory:

```env
# Server Config
PORT=5000

# PostgreSQL Connection String
DATABASE_URL="postgresql://username:password@localhost:5432/edumanagedb?schema=public"

# Auth Secrets
JWT_SECRET="generate_a_strong_random_string_here"
JWT_EXPIRES_IN="7d"

# Cloudinary (Image/Asset Storage)
CLOUDINARY_CLOUD_NAME="your_cloud_name"
CLOUDINARY_API_KEY="your_api_key"
CLOUDINARY_API_SECRET="your_api_secret"

# Email Services (For password resets / notifications)
EMAIL_USER="your_email@gmail.com"
EMAIL_PASS="your_app_password"
```

---

## 🌐 Core API Endpoints

| HTTP Method | Endpoint | Description | Guard / Role |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | Authenticate user and sign JWT | Public |
| `GET` | `/api/principal/metrics` | Retrieve aggregate KPI data | `Principal` |
| `POST` | `/api/teacher/bulk` | Parse XLSX for bulk teacher creation | `Principal` |
| `GET` | `/api/syllabus/class/:id` | Fetch specific class syllabus | `Teacher`, `Principal` |
| `PUT` | `/api/marks/approve/:id` | Approve student correction requests | `Principal` |
| `POST` | `/api/student/feedback` | Submit interactive teacher feedback | `Student` |

---

## 🛡️ Security Architecture

1. **BOLA (Broken Object Level Authorization) Prevention:** Users cannot query an ID belonging to another school or user. Our middleware implicitly queries the database using `where: { id: req.params.id, schoolId: req.user.schoolId }`.
2. **Password Salting:** Passwords are never stored in plaintext. `BcryptJS` hashes all credentials with complex salts.
3. **HTTP-Headers:** Using `Helmet` to obscure the `X-Powered-By` header and prevent clickjacking.
4. **Input Sanitization:** Using Prisma prevents SQL injection natively by relying on prepared statements for all queries.

---

## 📦 Deployment Instructions

**Recommended: Render, Railway, or Heroku**
1. Provision a PostgreSQL Database online (e.g., Supabase, Neon).
2. Set your deployment environment variables matching the `.env` requirements.
3. Use the start script defined in `package.json`: `node index.js`.
4. Ensure your build script runs `npx prisma migrate deploy` prior to starting the node process to keep the production database schema up to date.

---

## 🔮 Future Enhancements
- [ ] Implement Redis caching for heavily accessed endpoints (e.g., student marks and dashboard analytics).
- [ ] Incorporate WebSockets (Socket.io) for real-time live chat functionality between teachers and administrators.
- [ ] Detailed API logging using Winston and Morgan for better auditing.

---

## 🚧 Challenges Faced
- **Schema Migrations:** Balancing Prisma schema changes during active development without dropping critical test data. *Solution: Meticulous use of `prisma db push` locally and transitioning to `migrate dev` for structured deployments.*
- **CORS Conflict Resolution:** Resolving preflight failures across different domains between local development and production. *Solution: Configured dynamic CORS origin arrays.*

---

## 🎓 Learning Outcomes
- Advanced PostgreSQL database design via Prisma ORM.
- Implementing enterprise-tier authentication strategies using stateless JWTs.
- Defensive programming techniques and writing robust Express middleware chains.
- Managing background job scheduling natively within a Node environment.

---

## 🤝 Contributing Guidelines
Contributions are welcome! Please fork the project and open a PR against the `main` branch. Ensure any database schema changes are accompanied by the proper Prisma migrations.

---

## 📄 License
Distributed under the MIT License. See `LICENSE` for more information.

---

## 📫 Contact Information
**THIMOTHI BATHULA**
- **LinkedIn:** [Thimothi Bathula](https://www.linkedin.com/in/timothi-bathula/)

---
<div align="center">
  <i>Built with ❤️ by THIMOTHI BATHULA</i>
</div>
